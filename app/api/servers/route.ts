import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { one, query } from "@/lib/db";

const schema=z.object({
  name:z.string().trim().min(2).max(80),
  baseUrl:z.string().url().refine(v=>v.startsWith("http://")||v.startsWith("https://")),
  token:z.string().min(24).max(512)
});

export async function POST(request:Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Invalid server details"},{status:400});
  let status="OFFLINE";
  try{
    const res=await fetch(parsed.data.baseUrl.replace(/\/$/,"")+"/health",{headers:{authorization:"Bearer "+parsed.data.token},signal:AbortSignal.timeout(5000)});
    if(res.ok) status="ONLINE";
  }catch{}
  const server=await one<{id:number}>("INSERT INTO servers(name,base_url,agent_token_enc,status,last_seen) VALUES($1,$2,$3,$4,CASE WHEN $4='ONLINE' THEN NOW() ELSE NULL END) RETURNING id",
    [parsed.data.name,parsed.data.baseUrl.replace(/\/$/,""),encrypt(parsed.data.token),status]);
  await audit(user.id,"SERVER_REGISTERED","server",server?.id,{name:parsed.data.name,status});
  return NextResponse.json({ok:true,id:server?.id,status},{status:201});
}

export async function GET(){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  return NextResponse.json(await query("SELECT id,name,base_url,status,last_seen,created_at FROM servers ORDER BY id"));
}
