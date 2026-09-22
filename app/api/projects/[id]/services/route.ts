import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { one, query } from "@/lib/db";

const cronPart=/^(\*|\*\/[1-9][0-9]*|[0-9]+(?:-[0-9]+)?(?:\/[1-9][0-9]*)?(?:,[0-9]+(?:-[0-9]+)?(?:\/[1-9][0-9]*)?)*)$/;
function validCron(value:string){
  const parts=value.trim().split(/\s+/);
  return parts.length===5 && parts.every(part=>cronPart.test(part));
}

const schema=z.object({
  name:z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,40}$/),
  type:z.enum(["worker","cron"]),
  command:z.string().trim().min(1).max(1000).refine(v=>!v.includes("\n")),
  schedule:z.string().trim().max(100).optional().default("")
}).superRefine((value,ctx)=>{
  if(value.type==="cron"&&!validCron(value.schedule)){
    ctx.addIssue({code:"custom",path:["schedule"],message:"Cron schedule must use five fields"});
  }
});

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  return NextResponse.json(await query(
    "SELECT id,name,type,command,schedule,enabled,created_at,updated_at FROM project_services WHERE project_id=$1 ORDER BY type,name",
    [Number(id)]
  ));
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Invalid service configuration",issues:parsed.error.issues},{status:400});
  const {id}=await params;
  const projectId=Number(id);
  if(!await one("SELECT id FROM projects WHERE id=$1 AND archived_at IS NULL",[projectId])){
    return NextResponse.json({error:"Active project not found"},{status:404});
  }
  try{
    const service=await one(
      `INSERT INTO project_services(project_id,name,type,command,schedule)
       VALUES($1,$2,$3,$4,$5) RETURNING id,name,type,command,schedule,enabled,created_at,updated_at`,
      [projectId,parsed.data.name,parsed.data.type,parsed.data.command,parsed.data.type==="cron"?parsed.data.schedule:null]
    );
    await audit(user.id,"PROJECT_SERVICE_CREATED","project",projectId,{name:parsed.data.name,type:parsed.data.type});
    return NextResponse.json(service,{status:201});
  }catch{
    return NextResponse.json({error:"A service with that name already exists"},{status:409});
  }
}
