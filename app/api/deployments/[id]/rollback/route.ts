import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { enqueueDeployment } from "@/lib/queue";

type Source={id:number;project_id:number;commit_sha:string|null;image:string|null;status:string};

export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const source=await one<Source>("SELECT id,project_id,commit_sha,image,status FROM deployments WHERE id=$1",[Number(id)]);
  if(!source) return NextResponse.json({error:"Deployment not found"},{status:404});
  if(!source.image||!source.commit_sha) return NextResponse.json({error:"That deployment has no reusable image"},{status:400});
  const target=await one<{id:number}>(`INSERT INTO deployments(project_id,status,requested_commit,commit_sha,image)
    VALUES($1,'QUEUED',$2,$2,$3) RETURNING id`,[source.project_id,source.commit_sha,source.image]);
  if(!target) return NextResponse.json({error:"Could not queue rollback"},{status:500});
  await enqueueDeployment(target.id);
  await audit(user.id,"DEPLOYMENT_ROLLBACK_QUEUED","deployment",target.id,{sourceDeploymentId:source.id,projectId:source.project_id});
  return NextResponse.json({ok:true,deploymentId:target.id},{status:202});
}
