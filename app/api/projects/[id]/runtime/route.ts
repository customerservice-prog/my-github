import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { one } from "@/lib/db";

type ProjectRuntime={
  id:number;
  slug:string;
  base_url:string|null;
  agent_token_enc:string|null;
};

async function target(projectId:number){
  return one<ProjectRuntime>(`SELECT p.id,p.slug,s.base_url,s.agent_token_enc
    FROM projects p LEFT JOIN servers s ON s.id=p.server_id WHERE p.id=$1`,[projectId]);
}

async function agentFetch(project:ProjectRuntime,path:string,init:RequestInit={}){
  if(!project.base_url||!project.agent_token_enc) throw new Error("Project has no deployment agent");
  return fetch(project.base_url.replace(/\/$/,"")+path,{
    ...init,
    headers:{...init.headers,authorization:"Bearer "+decrypt(project.agent_token_enc)},
    signal:AbortSignal.timeout(10000),
    cache:"no-store"
  });
}

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const project=await target(Number(id));
  if(!project) return NextResponse.json({error:"Project not found"},{status:404});
  try{
    const lines=Math.min(1000,Math.max(20,Number(new URL(request.url).searchParams.get("lines")||200)));
    const [statusRes,logsRes]=await Promise.all([
      agentFetch(project,"/status?project="+encodeURIComponent(project.slug)),
      agentFetch(project,"/logs?project="+encodeURIComponent(project.slug)+"&lines="+lines)
    ]);
    const status=await statusRes.json().catch(()=>({status:"UNKNOWN"}));
    const logs=await logsRes.json().catch(()=>({logs:""}));
    return NextResponse.json({status,logs:logs.logs||"",container:logs.container||status.container||null});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:"Runtime unavailable"},{status:502});
  }
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const project=await target(Number(id));
  if(!project) return NextResponse.json({error:"Project not found"},{status:404});
  const body=await request.json().catch(()=>({}));
  if(body.action!=="restart") return NextResponse.json({error:"Unsupported action"},{status:400});
  try{
    const res=await agentFetch(project,"/restart",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({projectSlug:project.slug})
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok) return NextResponse.json({error:data.error||"Restart failed"},{status:res.status});
    await audit(user.id,"PROJECT_RUNTIME_RESTARTED","project",project.id,{container:data.container||null});
    return NextResponse.json(data);
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:"Runtime unavailable"},{status:502});
  }
}
