import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { one, query } from "@/lib/db";

const schema=z.object({action:z.enum(["archive","unarchive"])});
type Project={id:number;name:string;archived_at:string|null};

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Invalid lifecycle action"},{status:400});
  const {id}=await params;
  const project=await one<Project>("SELECT id,name,archived_at FROM projects WHERE id=$1",[Number(id)]);
  if(!project) return NextResponse.json({error:"Project not found"},{status:404});

  if(parsed.data.action==="archive"){
    await query("UPDATE projects SET archived_at=NOW(),auto_deploy=false,updated_at=NOW() WHERE id=$1",[project.id]);
    await audit(user.id,"PROJECT_ARCHIVED","project",project.id,{name:project.name});
    return NextResponse.json({ok:true,archived:true});
  }

  await query("UPDATE projects SET archived_at=NULL,updated_at=NOW() WHERE id=$1",[project.id]);
  await audit(user.id,"PROJECT_UNARCHIVED","project",project.id,{name:project.name});
  return NextResponse.json({ok:true,archived:false});
}
