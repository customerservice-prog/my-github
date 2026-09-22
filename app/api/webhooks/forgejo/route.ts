import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { one, query } from "@/lib/db";
import { enqueueDeployment } from "@/lib/queue";

type Project={
  id:number;
  slug:string;
  branch:string;
  domain:string;
  staging_branch:string|null;
  staging_domain:string|null;
  auto_deploy:boolean;
  archived_at:string|null;
  server_draining:boolean|null;
};
type Existing={id:number};

function verify(raw:string,request:Request){
  const secret=process.env.WEBHOOK_SECRET;
  if(!secret) return false;
  let supplied=request.headers.get("x-forgejo-signature")||request.headers.get("x-gitea-signature")||request.headers.get("x-hub-signature-256")||"";
  supplied=supplied.replace(/^sha256=/,"");
  const expected=createHmac("sha256",secret).update(raw).digest("hex");
  const a=Buffer.from(supplied);
  const b=Buffer.from(expected);
  return a.length===b.length && timingSafeEqual(a,b);
}

export async function POST(request:Request){
  const raw=await request.text();
  if(!verify(raw,request)) return NextResponse.json({error:"Invalid signature"},{status:401});
  let body:any;
  try{body=JSON.parse(raw);}catch{return NextResponse.json({error:"Invalid JSON"},{status:400});}
  const fullName=body?.repository?.full_name;
  const ref=String(body?.ref||"");
  const after=String(body?.after||"");
  if(!fullName||!ref.startsWith("refs/heads/")||!after) return NextResponse.json({ok:true,ignored:true});
  const branch=ref.replace("refs/heads/","");
  const projects=await query<Project>(
    `SELECT p.id,p.slug,p.branch,p.domain,p.staging_branch,p.staging_domain,p.auto_deploy,p.archived_at,s.draining server_draining
     FROM projects p LEFT JOIN servers s ON s.id=p.server_id WHERE p.repo_full_name=$1`,
    [fullName]
  );
  let queued=0;
  for(const project of projects){
    if(!project.auto_deploy||project.archived_at||project.server_draining) continue;

    let environment:"production"|"staging"|null=null;
    let targetSlug=project.slug;
    let targetDomain=project.domain;

    if(project.branch===branch){
      environment="production";
    }else if(project.staging_domain && (project.staging_branch||"staging")===branch){
      environment="staging";
      targetSlug=(project.slug+"-staging").slice(0,63).replace(/-+$/,"");
      targetDomain=project.staging_domain;
    }

    if(!environment) continue;

    const existing=await one<Existing>(
      "SELECT id FROM deployments WHERE project_id=$1 AND requested_commit=$2 AND environment=$3 AND queued_at>NOW()-INTERVAL '1 day' LIMIT 1",
      [project.id,after,environment]
    );
    if(existing) continue;

    const deployment=await one<{id:number}>(
      `INSERT INTO deployments(project_id,status,requested_commit,environment,target_slug,target_branch,target_domain)
       VALUES($1,'QUEUED',$2,$3,$4,$5,$6) RETURNING id`,
      [project.id,after,environment,targetSlug,branch,targetDomain]
    );
    if(deployment){
      await enqueueDeployment(deployment.id);
      queued++;
    }
  }
  return NextResponse.json({ok:true,queued});
}
