import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { one, query } from "@/lib/db";

type Deployment={id:number;project_id:number;status:string};

export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const deployment=await one<Deployment>("SELECT id,project_id,status FROM deployments WHERE id=$1",[Number(id)]);
  if(!deployment) return NextResponse.json({error:"Deployment not found"},{status:404});
  if(deployment.status!=="QUEUED"){
    return NextResponse.json({error:"Only queued deployments can be canceled safely"},{status:409});
  }
  await query("UPDATE deployments SET status='CANCELLED',finished_at=NOW() WHERE id=$1 AND status='QUEUED'",[deployment.id]);
  await audit(user.id,"DEPLOYMENT_CANCELLED","deployment",deployment.id,{projectId:deployment.project_id});
  return NextResponse.json({ok:true});
}
