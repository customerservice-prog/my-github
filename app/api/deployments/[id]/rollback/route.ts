import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { enqueueDeployment } from "@/lib/queue";

type Source={id:number;project_id:number;commit_sha:string|null;image:string|null;status:string;environment:string;target_slug:string|null;target_branch:string|null;target_domain:string|null};

export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const source=await one<Source>("SELECT id,project_id,commit_sha,image,status,environment,target_slug,target_branch,target_domain FROM deployments WHERE id=$1",[Number(id)]);
  if(!source) return NextResponse.json({error:"Deployment not found"},{status:404});
  if(!source.image||!source.commit_sha) return NextResponse.json({error:"That deployment has no reusable image"},{status:400});
  const target=await one<{id:number}>(`INSERT INTO deployments(project_id,status,requested_commit,commit_sha,image,environment,target_slug,target_branch,target_domain)
    VALUES($1,'QUEUED',$2,$2,$3,$4,$5,$6,$7) RETURNING id`,[source.project_id,source.commit_sha,source.image,source.environment,source.target_slug,source.target_branch,source.target_domain]);
  if(!target) return NextResponse.json({error:"Could not queue rollback"},{status:500});
  await enqueueDeployment(target.id);
  await audit(user.id,"DEPLOYMENT_ROLLBACK_QUEUED","deployment",target.id,{sourceDeploymentId:source.id,projectId:source.project_id,environment:source.environment,domain:source.target_domain});
  return NextResponse.json({ok:true,deploymentId:target.id},{status:202});
}
