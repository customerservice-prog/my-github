import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { one, query } from "@/lib/db";

const schema=z.object({enabled:z.boolean()});

export async function PATCH(request:Request,{params}:{params:Promise<{id:string;serviceId:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Invalid service update"},{status:400});
  const {id,serviceId}=await params;
  const service=await one<{id:number;name:string;type:string}>(
    "SELECT id,name,type FROM project_services WHERE id=$1 AND project_id=$2",
    [Number(serviceId),Number(id)]
  );
  if(!service) return NextResponse.json({error:"Service not found"},{status:404});
  await query("UPDATE project_services SET enabled=$1,updated_at=NOW() WHERE id=$2",[parsed.data.enabled,service.id]);
  await audit(user.id,parsed.data.enabled?"PROJECT_SERVICE_ENABLED":"PROJECT_SERVICE_DISABLED","project",Number(id),{serviceId:service.id,name:service.name,type:service.type});
  return NextResponse.json({ok:true});
}

export async function DELETE(_request:Request,{params}:{params:Promise<{id:string;serviceId:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id,serviceId}=await params;
  const service=await one<{id:number;name:string;type:string}>(
    "SELECT id,name,type FROM project_services WHERE id=$1 AND project_id=$2",
    [Number(serviceId),Number(id)]
  );
  if(!service) return NextResponse.json({error:"Service not found"},{status:404});
  await query("DELETE FROM project_services WHERE id=$1",[service.id]);
  await audit(user.id,"PROJECT_SERVICE_DELETED","project",Number(id),{serviceId:service.id,name:service.name,type:service.type});
  return NextResponse.json({ok:true});
}
