import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { query } from "@/lib/db";

const schema=z.object({
  key:z.string().trim().regex(/^[A-Z_][A-Z0-9_]*$/).max(100),
  value:z.string().max(20000).refine(v=>!v.includes("\n"),"Multiline values must be encoded before storage"),
  secret:z.boolean().default(true)
});

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const projectId=Number(id);
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Invalid environment variable"},{status:400});
  await query(`INSERT INTO project_env(project_id,key,value_enc,secret) VALUES($1,$2,$3,$4)
    ON CONFLICT(project_id,key) DO UPDATE SET value_enc=EXCLUDED.value_enc,secret=EXCLUDED.secret,updated_at=NOW()`,
    [projectId,parsed.data.key,encrypt(parsed.data.value),parsed.data.secret]);
  await audit(user.id,"PROJECT_ENV_UPDATED","project",projectId,{key:parsed.data.key,secret:parsed.data.secret});
  return NextResponse.json({ok:true});
}

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const key=new URL(request.url).searchParams.get("key");
  if(!key) return NextResponse.json({error:"key is required"},{status:400});
  await query("DELETE FROM project_env WHERE project_id=$1 AND key=$2",[Number(id),key]);
  await audit(user.id,"PROJECT_ENV_DELETED","project",Number(id),{key});
  return NextResponse.json({ok:true});
}
