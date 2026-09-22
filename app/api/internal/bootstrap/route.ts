import { NextResponse } from "next/server";
import { encrypt } from "@/lib/crypto";
import { one, query } from "@/lib/db";

export async function POST(request:Request){
  const expected=process.env.INTERNAL_API_TOKEN;
  const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  if(!expected||token!==expected) return NextResponse.json({error:"Unauthorized"},{status:401});

  const baseUrl=(process.env.LOCAL_AGENT_URL||"http://agent:7001").replace(/\/$/,"");
  const agentToken=process.env.LOCAL_AGENT_TOKEN;
  if(!agentToken||agentToken.length<24) return NextResponse.json({error:"LOCAL_AGENT_TOKEN is not configured"},{status:503});

  let status="OFFLINE";
  try{
    const response=await fetch(baseUrl+"/health",{
      headers:{authorization:"Bearer "+agentToken},
      signal:AbortSignal.timeout(5000)
    });
    if(response.ok) status="ONLINE";
  }catch{}

  const existing=await one<{id:number}>("SELECT id FROM servers WHERE base_url=$1 LIMIT 1",[baseUrl]);
  if(existing){
    await query(
      "UPDATE servers SET name='Local Production',agent_token_enc=$1,status=$2,last_seen=CASE WHEN $2='ONLINE' THEN NOW() ELSE last_seen END,updated_at=NOW() WHERE id=$3",
      [encrypt(agentToken),status,existing.id]
    );
    return NextResponse.json({ok:true,id:existing.id,status,created:false});
  }

  const server=await one<{id:number}>(
    "INSERT INTO servers(name,base_url,agent_token_enc,status,last_seen) VALUES('Local Production',$1,$2,$3,CASE WHEN $3='ONLINE' THEN NOW() ELSE NULL END) RETURNING id",
    [baseUrl,encrypt(agentToken),status]
  );
  return NextResponse.json({ok:true,id:server?.id,status,created:true},{status:201});
}
