import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { enqueueDeployment } from "@/lib/queue";
import { slugify, validDomain } from "@/lib/utils";

const schema=z.object({
  environment:z.enum(["production","staging","preview"]).default("production"),
  branch:z.string().trim().min(1).max(200).optional()
});

type Project={
  id:number;
  slug:string;
  server_id:number|null;
  branch:string;
  domain:string;
  staging_branch:string|null;
  staging_domain:string|null;
  archived_at:string|null;
};

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>({})));
  if(!parsed.success) return NextResponse.json({error:"Invalid deployment target"},{status:400});
  const {id}=await params;
  const project=await one<Project>(
    "SELECT id,slug,server_id,branch,domain,staging_branch,staging_domain,archived_at FROM projects WHERE id=$1",
    [Number(id)]
  );
  if(!project) return NextResponse.json({error:"Project not found"},{status:404});
  if(project.archived_at) return NextResponse.json({error:"Archived projects cannot be deployed"},{status:409});
  if(!project.server_id) return NextResponse.json({error:"Assign a deployment server first"},{status:400});

  let targetBranch=project.branch;
  let targetDomain=project.domain;
  let targetSlug=project.slug;

  if(parsed.data.environment==="staging"){
    if(!project.staging_domain) return NextResponse.json({error:"Configure a staging domain first"},{status:400});
    targetBranch=project.staging_branch||"staging";
    targetDomain=project.staging_domain;
    targetSlug=(project.slug+"-staging").slice(0,63).replace(/-+$/,"");
  }

  if(parsed.data.environment==="preview"){
    const branch=parsed.data.branch;
    if(!branch) return NextResponse.json({error:"A branch is required for preview deployments"},{status:400});
    const base=process.env.PREVIEW_BASE_DOMAIN?.trim().toLowerCase();
    if(!base||!validDomain(base)) return NextResponse.json({error:"PREVIEW_BASE_DOMAIN is not configured"},{status:503});
    const branchSlug=slugify(branch);
    if(!branchSlug) return NextResponse.json({error:"That branch cannot produce a preview hostname"},{status:400});
    const label=(project.slug+"-"+branchSlug).slice(0,63).replace(/-+$/,"");
    targetBranch=branch;
    targetDomain=label+"."+base;
    targetSlug=label;
  }

  const deployment=await one<{id:number}>(
    `INSERT INTO deployments(project_id,status,environment,target_slug,target_branch,target_domain)
     VALUES($1,'QUEUED',$2,$3,$4,$5) RETURNING id`,
    [project.id,parsed.data.environment,targetSlug,targetBranch,targetDomain]
  );
  if(!deployment) return NextResponse.json({error:"Could not create deployment"},{status:500});
  await enqueueDeployment(deployment.id);
  await audit(user.id,"DEPLOYMENT_QUEUED","deployment",deployment.id,{
    projectId:project.id,
    environment:parsed.data.environment,
    branch:targetBranch,
    domain:targetDomain
  });
  return NextResponse.json({ok:true,deploymentId:deployment.id,domain:targetDomain},{status:202});
}
