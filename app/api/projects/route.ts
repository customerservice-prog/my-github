import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { ensureDeployWebhook } from "@/lib/forgejo";
import { slugify, validDomain } from "@/lib/utils";
import { assertForgejoProjectUrl } from "@/lib/network";

const schema=z.object({
  name:z.string().trim().min(2).max(80),
  repoFullName:z.string().trim().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  repoUrl:z.string().url(),
  domain:z.string().trim().toLowerCase(),
  branch:z.string().trim().min(1).max(200).default("main"),
  stagingDomain:z.string().trim().toLowerCase().optional().or(z.literal("")),
  stagingBranch:z.string().trim().min(1).max(200).default("staging"),
  dockerfile:z.string().trim().min(1).max(300).default("Dockerfile"),
  containerPort:z.number().int().min(1).max(65535).default(3000),
  healthPath:z.string().trim().regex(/^\//).max(300).default("/api/health"),
  serverId:z.number().int().positive()
});

export async function GET(){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  return NextResponse.json(await query("SELECT * FROM projects WHERE archived_at IS NULL ORDER BY id DESC"));
}

export async function POST(request:Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Invalid project configuration",issues:parsed.error.issues},{status:400});
  if(!validDomain(parsed.data.domain)) return NextResponse.json({error:"Invalid production domain"},{status:400});
  let safeRepoUrl:string;
  try{safeRepoUrl=assertForgejoProjectUrl(parsed.data.repoUrl);}catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Invalid project repository URL"},{status:400});
  }
  if(parsed.data.stagingDomain && !validDomain(parsed.data.stagingDomain)) return NextResponse.json({error:"Invalid staging domain"},{status:400});
  const slug=slugify(parsed.data.name);
  if(!slug) return NextResponse.json({error:"Project name cannot produce a valid slug"},{status:400});
  const server=await one("SELECT id FROM servers WHERE id=$1",[parsed.data.serverId]);
  if(!server) return NextResponse.json({error:"Deployment server not found"},{status:400});
  try{
    const project=await one<{id:number}>(`INSERT INTO projects(name,slug,repo_full_name,repo_url,branch,staging_domain,staging_branch,dockerfile,domain,container_port,health_path,server_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [parsed.data.name,slug,parsed.data.repoFullName,safeRepoUrl,parsed.data.branch,parsed.data.stagingDomain||null,parsed.data.stagingBranch,parsed.data.dockerfile,parsed.data.domain,parsed.data.containerPort,parsed.data.healthPath,parsed.data.serverId]);
    await audit(user.id,"PROJECT_CREATED","project",project?.id,{slug,domain:parsed.data.domain,repo:parsed.data.repoFullName});
    let webhook:{id:number;created:boolean}|null=null;
    let webhookWarning:string|null=null;
    try{
      webhook=await ensureDeployWebhook(parsed.data.repoFullName,parsed.data.branch);
      await audit(user.id,"DEPLOY_WEBHOOK_READY","project",project?.id,{hookId:webhook.id,created:webhook.created});
    }catch(error){
      webhookWarning=error instanceof Error?error.message:"Could not configure auto-deploy webhook";
      await audit(user.id,"DEPLOY_WEBHOOK_FAILED","project",project?.id,{error:webhookWarning});
    }
    return NextResponse.json({ok:true,id:project?.id,webhook,warning:webhookWarning},{status:201});
  }catch(e){
    const message=e instanceof Error?e.message:"Project creation failed";
    if(message.includes("projects_slug_key")) return NextResponse.json({error:"A project with that name already exists"},{status:409});
    return NextResponse.json({error:"Project creation failed"},{status:500});
  }
}
