import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { one, query } from "@/lib/db";

const schema=z.object({draining:z.boolean()});

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Invalid server state"},{status:400});
  const {id}=await params;
  const serverId=Number(id);
  const server=await one<{id:number;name:string}>("SELECT id,name FROM servers WHERE id=$1",[serverId]);
  if(!server) return NextResponse.json({error:"Server not found"},{status:404});
  await query("UPDATE servers SET draining=$1,updated_at=NOW() WHERE id=$2",[parsed.data.draining,serverId]);
  await audit(user.id,parsed.data.draining?"SERVER_DRAIN_ENABLED":"SERVER_DRAIN_DISABLED","server",serverId,{name:server.name});
  return NextResponse.json({ok:true,draining:parsed.data.draining});
}
