import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { one, query } from "@/lib/db";
import { enqueueDeployment } from "@/lib/queue";

type Project={id:number;branch:string;auto_deploy:boolean};
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
  const projects=await query<Project>("SELECT id,branch,auto_deploy FROM projects WHERE repo_full_name=$1",[fullName]);
  let queued=0;
  for(const project of projects){
    if(!project.auto_deploy||project.branch!==branch) continue;
    const existing=await one<Existing>("SELECT id FROM deployments WHERE project_id=$1 AND requested_commit=$2 AND queued_at>NOW()-INTERVAL '1 day' LIMIT 1",[project.id,after]);
    if(existing) continue;
    const deployment=await one<{id:number}>("INSERT INTO deployments(project_id,status,requested_commit) VALUES($1,'QUEUED',$2) RETURNING id",[project.id,after]);
    if(deployment){await enqueueDeployment(deployment.id);queued++;}
  }
  return NextResponse.json({ok:true,queued});
}
