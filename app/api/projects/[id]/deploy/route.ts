import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { enqueueDeployment } from "@/lib/queue";

type Project={id:number;server_id:number|null};

export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const project=await one<Project>("SELECT id,server_id FROM projects WHERE id=$1",[Number(id)]);
  if(!project) return NextResponse.json({error:"Project not found"},{status:404});
  if(!project.server_id) return NextResponse.json({error:"Assign a deployment server first"},{status:400});
  const deployment=await one<{id:number}>("INSERT INTO deployments(project_id,status) VALUES($1,'QUEUED') RETURNING id",[project.id]);
  if(!deployment) return NextResponse.json({error:"Could not create deployment"},{status:500});
  await enqueueDeployment(deployment.id);
  await audit(user.id,"DEPLOYMENT_QUEUED","deployment",deployment.id,{projectId:project.id});
  return NextResponse.json({ok:true,deploymentId:deployment.id},{status:202});
}
