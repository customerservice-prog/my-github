import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { ensureDeployWebhook } from "@/lib/forgejo";
import { validDomain } from "@/lib/utils";
import { assertForgejoProjectUrl } from "@/lib/network";

const schema=z.object({
  repoFullName:z.string().trim().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  repoUrl:z.string().url(),
  domain:z.string().trim().toLowerCase(),
  branch:z.string().trim().min(1).max(200),
  stagingDomain:z.string().trim().toLowerCase().optional().or(z.literal("")),
  stagingBranch:z.string().trim().min(1).max(200),
  dockerfile:z.string().trim().min(1).max(300),
  containerPort:z.number().int().min(1).max(65535),
  healthPath:z.string().trim().regex(/^\//).max(300),
  serverId:z.number().int().positive(),
  autoDeploy:z.boolean()
});

type Project={id:number;archived_at:string|null};

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
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
  const {id}=await params;
  const project=await one<Project>("SELECT id,archived_at FROM projects WHERE id=$1",[Number(id)]);
  if(!project) return NextResponse.json({error:"Project not found"},{status:404});
  if(project.archived_at) return NextResponse.json({error:"Restore the project before editing its deployment configuration"},{status:409});
  if(!await one("SELECT id FROM servers WHERE id=$1",[parsed.data.serverId])){
    return NextResponse.json({error:"Deployment server not found"},{status:400});
  }

  await query(`UPDATE projects SET
    repo_full_name=$1,repo_url=$2,domain=$3,branch=$4,staging_domain=$5,staging_branch=$6,
    dockerfile=$7,container_port=$8,health_path=$9,server_id=$10,auto_deploy=$11,updated_at=NOW()
    WHERE id=$12`,[
      parsed.data.repoFullName,
      safeRepoUrl,
      parsed.data.domain,
      parsed.data.branch,
      parsed.data.stagingDomain||null,
      parsed.data.stagingBranch,
      parsed.data.dockerfile,
      parsed.data.containerPort,
      parsed.data.healthPath,
      parsed.data.serverId,
      parsed.data.autoDeploy,
      project.id
    ]);

  let webhookWarning:string|null=null;
  if(parsed.data.autoDeploy){
    try{
      await ensureDeployWebhook(parsed.data.repoFullName,parsed.data.branch);
    }catch(error){
      webhookWarning=error instanceof Error?error.message:"Could not update deployment webhook";
    }
  }

  await audit(user.id,"PROJECT_CONFIGURATION_UPDATED","project",project.id,{
    repo:parsed.data.repoFullName,
    domain:parsed.data.domain,
    stagingDomain:parsed.data.stagingDomain||null,
    serverId:parsed.data.serverId,
    autoDeploy:parsed.data.autoDeploy,
    webhookWarning
  });
  return NextResponse.json({ok:true,warning:webhookWarning});
}
