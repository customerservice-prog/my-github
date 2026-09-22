import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { slugify, validDomain } from "@/lib/utils";

const schema=z.object({
  name:z.string().trim().min(2).max(80),
  repoFullName:z.string().trim().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  repoUrl:z.string().url(),
  domain:z.string().trim().toLowerCase(),
  branch:z.string().trim().min(1).max(200).default("main"),
  dockerfile:z.string().trim().min(1).max(300).default("Dockerfile"),
  containerPort:z.number().int().min(1).max(65535).default(3000),
  healthPath:z.string().trim().regex(/^\//).max(300).default("/api/health"),
  serverId:z.number().int().positive()
});

export async function GET(){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  return NextResponse.json(await query("SELECT * FROM projects ORDER BY id DESC"));
}

export async function POST(request:Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Invalid project configuration",issues:parsed.error.issues},{status:400});
  if(!validDomain(parsed.data.domain)) return NextResponse.json({error:"Invalid production domain"},{status:400});
  const slug=slugify(parsed.data.name);
  if(!slug) return NextResponse.json({error:"Project name cannot produce a valid slug"},{status:400});
  const server=await one("SELECT id FROM servers WHERE id=$1",[parsed.data.serverId]);
  if(!server) return NextResponse.json({error:"Deployment server not found"},{status:400});
  try{
    const project=await one<{id:number}>(`INSERT INTO projects(name,slug,repo_full_name,repo_url,branch,dockerfile,domain,container_port,health_path,server_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [parsed.data.name,slug,parsed.data.repoFullName,parsed.data.repoUrl,parsed.data.branch,parsed.data.dockerfile,parsed.data.domain,parsed.data.containerPort,parsed.data.healthPath,parsed.data.serverId]);
    await audit(user.id,"PROJECT_CREATED","project",project?.id,{slug,domain:parsed.data.domain,repo:parsed.data.repoFullName});
    return NextResponse.json({ok:true,id:project?.id},{status:201});
  }catch(e){
    const message=e instanceof Error?e.message:"Project creation failed";
    if(message.includes("projects_slug_key")) return NextResponse.json({error:"A project with that name already exists"},{status:409});
    return NextResponse.json({error:"Project creation failed"},{status:500});
  }
}
