import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { one, query } from "@/lib/db";

type Project={id:number;slug:string};
type Bucket={id:number;bucket_name:string;endpoint:string;created_at:string};

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  return NextResponse.json(await one<Bucket>("SELECT id,bucket_name,endpoint,created_at FROM project_buckets WHERE project_id=$1",[Number(id)]));
}

export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const project=await one<Project>("SELECT id,slug FROM projects WHERE id=$1",[Number(id)]);
  if(!project) return NextResponse.json({error:"Project not found"},{status:404});
  const existing=await one<Bucket>("SELECT id,bucket_name,endpoint,created_at FROM project_buckets WHERE project_id=$1",[project.id]);
  if(existing) return NextResponse.json(existing);

  const accessKey=("MG"+randomBytes(10).toString("hex")).toUpperCase().slice(0,22);
  const secretKey=randomBytes(36).toString("base64url");
  const bucket=("mg-"+project.id+"-"+project.slug).slice(0,63).replace(/-+$/,"");
  const agent=(process.env.LOCAL_AGENT_URL||"http://agent:7001").replace(/\/$/,"");
  const agentToken=process.env.LOCAL_AGENT_TOKEN;
  if(!agentToken) return NextResponse.json({error:"LOCAL_AGENT_TOKEN is not configured"},{status:503});

  try{
    const response=await fetch(agent+"/storage/provision",{
      method:"POST",
      headers:{authorization:"Bearer "+agentToken,"content-type":"application/json"},
      body:JSON.stringify({projectSlug:project.slug,bucket,accessKey,secretKey}),
      signal:AbortSignal.timeout(60000)
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(result.error||"Storage agent rejected provisioning");
    const endpoint=String(result.endpoint||process.env.STORAGE_PUBLIC_URL||"");

    const record=await one<Bucket>(`INSERT INTO project_buckets(project_id,bucket_name,access_key_enc,secret_key_enc,endpoint)
      VALUES($1,$2,$3,$4,$5) RETURNING id,bucket_name,endpoint,created_at`,
      [project.id,bucket,encrypt(accessKey),encrypt(secretKey),endpoint]);

    const values=[
      ["S3_ENDPOINT",endpoint],
      ["S3_BUCKET",bucket],
      ["S3_REGION","us-east-1"],
      ["S3_FORCE_PATH_STYLE","true"],
      ["AWS_ACCESS_KEY_ID",accessKey],
      ["AWS_SECRET_ACCESS_KEY",secretKey]
    ];
    for(const [key,value] of values){
      await query(`INSERT INTO project_env(project_id,key,value_enc,secret,environment) VALUES($1,$2,$3,true,'production')
        ON CONFLICT(project_id,environment,key) DO UPDATE SET value_enc=EXCLUDED.value_enc,secret=true,updated_at=NOW()`,
        [project.id,key,encrypt(value)]);
    }

    await audit(user.id,"PROJECT_BUCKET_PROVISIONED","project",project.id,{bucket,endpoint});
    return NextResponse.json(record,{status:201});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Object storage provisioning failed"},{status:502});
  }
}
