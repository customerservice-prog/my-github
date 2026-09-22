import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { createRepository, importRepository, listRepositories } from "@/lib/forgejo";
import { slugify } from "@/lib/utils";
import { assertPublicHttpsGitUrl } from "@/lib/network";

const schema=z.object({
  mode:z.enum(["create","import"]),
  name:z.string().trim().min(1).max(100),
  description:z.string().trim().max(500).optional().default(""),
  cloneUrl:z.string().url().optional().or(z.literal("")),
  private:z.boolean().default(true)
});

export async function GET(){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  try{return NextResponse.json(await listRepositories());}
  catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Forgejo unavailable"},{status:502});}
}

export async function POST(request:Request){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Invalid repository request"},{status:400});
  const name=slugify(parsed.data.name);
  if(!name) return NextResponse.json({error:"Invalid repository name"},{status:400});
  try{
    const cloneUrl=parsed.data.mode==="import"?await assertPublicHttpsGitUrl(parsed.data.cloneUrl||""):"";
    const repo=parsed.data.mode==="import"
      ? await importRepository({name,cloneUrl,private:parsed.data.private})
      : await createRepository({name,description:parsed.data.description,private:parsed.data.private});
    await query(`INSERT INTO repositories(full_name,clone_url,html_url,private) VALUES($1,$2,$3,$4)
      ON CONFLICT(full_name) DO UPDATE SET clone_url=EXCLUDED.clone_url,html_url=EXCLUDED.html_url,private=EXCLUDED.private`,
      [repo.full_name,repo.clone_url,repo.html_url,repo.private]);
    await audit(user.id,parsed.data.mode==="import"?"REPOSITORY_IMPORTED":"REPOSITORY_CREATED","repository",repo.full_name,{private:repo.private});
    return NextResponse.json(repo,{status:201});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:"Repository operation failed"},{status:502});
  }
}
