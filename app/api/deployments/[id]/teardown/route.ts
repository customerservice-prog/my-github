import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { one, query } from "@/lib/db";

type Deployment={
  id:number;
  project_id:number;
  environment:string;
  target_slug:string|null;
  status:string;
  base_url:string|null;
  agent_token_enc:string|null;
};

export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const deployment=await one<Deployment>(`SELECT d.id,d.project_id,d.environment,d.target_slug,d.status,s.base_url,s.agent_token_enc
    FROM deployments d JOIN projects p ON p.id=d.project_id LEFT JOIN servers s ON s.id=p.server_id WHERE d.id=$1`,[Number(id)]);
  if(!deployment) return NextResponse.json({error:"Deployment not found"},{status:404});
  if(deployment.environment!=="preview") return NextResponse.json({error:"Only preview environments can be torn down here"},{status:400});
  if(!deployment.target_slug||!deployment.base_url||!deployment.agent_token_enc){
    return NextResponse.json({error:"Preview deployment has no active target agent"},{status:409});
  }

  try{
    const response=await fetch(deployment.base_url.replace(/\/$/,"")+"/remove",{
      method:"POST",
      headers:{
        authorization:"Bearer "+decrypt(deployment.agent_token_enc),
        "content-type":"application/json"
      },
      body:JSON.stringify({projectSlug:deployment.target_slug,removeVolumes:true}),
      signal:AbortSignal.timeout(30000)
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok) return NextResponse.json({error:result.error||"Preview teardown failed"},{status:502});
    await query("UPDATE deployments SET status='REMOVED',finished_at=NOW() WHERE project_id=$1 AND environment='preview' AND target_slug=$2 AND status <> 'REMOVED'",[deployment.project_id,deployment.target_slug]);
    await audit(user.id,"PREVIEW_TORN_DOWN","deployment",deployment.id,{projectId:deployment.project_id,targetSlug:deployment.target_slug});
    return NextResponse.json({ok:true});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Preview teardown failed"},{status:502});
  }
}
