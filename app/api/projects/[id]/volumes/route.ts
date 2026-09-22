import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { one, query } from "@/lib/db";

const schema=z.object({
  name:z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,40}$/),
  mountPath:z.string().trim().regex(/^\/[A-Za-z0-9._/-]+$/).max(300)
}).refine(v=>!v.mountPath.split("/").includes(".."),"Invalid mount path");

type Volume={id:number;name:string;mount_path:string;created_at:string};

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  return NextResponse.json(await query<Volume>("SELECT id,name,mount_path,created_at FROM project_volumes WHERE project_id=$1 ORDER BY name",[Number(id)]));
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const projectId=Number(id);
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Use a short lowercase volume name and an absolute mount path"},{status:400});
  const project=await one("SELECT id FROM projects WHERE id=$1",[projectId]);
  if(!project) return NextResponse.json({error:"Project not found"},{status:404});
  try{
    const volume=await one<Volume>("INSERT INTO project_volumes(project_id,name,mount_path) VALUES($1,$2,$3) RETURNING id,name,mount_path,created_at",
      [projectId,parsed.data.name,parsed.data.mountPath]);
    await audit(user.id,"PROJECT_VOLUME_CREATED","project",projectId,{name:parsed.data.name,mountPath:parsed.data.mountPath});
    return NextResponse.json(volume,{status:201});
  }catch{
    return NextResponse.json({error:"That volume name or mount path is already used by this project"},{status:409});
  }
}

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const projectId=Number(id);
  const name=new URL(request.url).searchParams.get("name");
  if(!name||!/^[a-z0-9][a-z0-9-]{0,40}$/.test(name)) return NextResponse.json({error:"Invalid volume name"},{status:400});
  await query("DELETE FROM project_volumes WHERE project_id=$1 AND name=$2",[projectId,name]);
  await audit(user.id,"PROJECT_VOLUME_DETACHED","project",projectId,{name});
  return NextResponse.json({ok:true,note:"The Docker volume is intentionally retained on the server to prevent accidental data loss."});
}
