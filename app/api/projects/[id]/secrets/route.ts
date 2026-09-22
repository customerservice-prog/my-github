import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { query } from "@/lib/db";

const schema=z.object({
  key:z.string().trim().regex(/^[A-Z_][A-Z0-9_]*$/).max(100),
  value:z.string().max(20000).refine(v=>!v.includes("\n"),"Multiline values must be encoded before storage"),
  secret:z.boolean().default(true),
  environment:z.enum(["production","staging","preview","all"]).default("production")
});

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const projectId=Number(id);
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Invalid environment variable"},{status:400});
  await query(`INSERT INTO project_env(project_id,key,value_enc,secret,environment) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(project_id,environment,key) DO UPDATE SET value_enc=EXCLUDED.value_enc,secret=EXCLUDED.secret,updated_at=NOW()`,
    [projectId,parsed.data.key,encrypt(parsed.data.value),parsed.data.secret,parsed.data.environment]);
  await audit(user.id,"PROJECT_ENV_UPDATED","project",projectId,{key:parsed.data.key,secret:parsed.data.secret,environment:parsed.data.environment});
  return NextResponse.json({ok:true});
}

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const url=new URL(request.url);
  const key=url.searchParams.get("key");
  const environment=url.searchParams.get("environment")||"production";
  if(!key) return NextResponse.json({error:"key is required"},{status:400});
  if(!["production","staging","preview","all"].includes(environment)) return NextResponse.json({error:"Invalid environment"},{status:400});
  await query("DELETE FROM project_env WHERE project_id=$1 AND key=$2 AND environment=$3",[Number(id),key,environment]);
  await audit(user.id,"PROJECT_ENV_DELETED","project",Number(id),{key,environment});
  return NextResponse.json({ok:true});
}
