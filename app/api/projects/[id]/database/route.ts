import { randomBytes } from "node:crypto";
import pg from "pg";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { one, query } from "@/lib/db";

type Project={id:number;slug:string;base_url:string|null};
type ManagedDb={id:number;name:string;username:string;host:string;port:number;created_at:string};

function safeIdent(value:string){
  const out=value.toLowerCase().replace(/[^a-z0-9_]/g,"_").replace(/^([^a-z_])/,"p_$1").slice(0,50);
  if(!/^[a-z_][a-z0-9_]*$/.test(out)) throw new Error("Could not produce safe database identifier");
  return out;
}

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  return NextResponse.json(await one<ManagedDb>("SELECT id,name,username,host,port,created_at FROM project_databases WHERE project_id=$1",[Number(id)]));
}

export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();
  if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
  const {id}=await params;
  const project=await one<Project>("SELECT p.id,p.slug,s.base_url FROM projects p LEFT JOIN servers s ON s.id=p.server_id WHERE p.id=$1",[Number(id)]);
  if(!project) return NextResponse.json({error:"Project not found"},{status:404});
  const existing=await one<ManagedDb>("SELECT id,name,username,host,port,created_at FROM project_databases WHERE project_id=$1",[project.id]);
  if(existing) return NextResponse.json(existing);

  const localUrl=(process.env.LOCAL_AGENT_URL||"http://agent:7001").replace(/\/$/,"");
  if((project.base_url||"").replace(/\/$/,"")!==localUrl){
    return NextResponse.json({error:"Bundled managed PostgreSQL is reachable only from the local deployment node. Configure a private database reachable by this remote server instead."},{status:400});
  }

  const adminUrl=process.env.APP_DATABASE_ADMIN_URL;
  if(!adminUrl) return NextResponse.json({error:"APP_DATABASE_ADMIN_URL is not configured"},{status:503});
  const name=safeIdent("p_"+project.id+"_"+project.slug);
  const username=safeIdent("u_"+project.id+"_"+project.slug);
  const password=randomBytes(32).toString("base64url");
  const client=new pg.Client({connectionString:adminUrl});
  try{
    await client.connect();
    const role=await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1",[username]);
    if(!role.rowCount) await client.query(`CREATE ROLE "${username}" LOGIN PASSWORD '${password}'`);
    else await client.query(`ALTER ROLE "${username}" PASSWORD '${password}'`);
    const db=await client.query("SELECT 1 FROM pg_database WHERE datname=$1",[name]);
    if(!db.rowCount) await client.query(`CREATE DATABASE "${name}" OWNER "${username}"`);
  }finally{
    await client.end().catch(()=>{});
  }

  const host="app-postgres";
  const port=5432;
  const url="postgresql://"+encodeURIComponent(username)+":"+encodeURIComponent(password)+"@"+host+":"+port+"/"+encodeURIComponent(name);
  const record=await one<ManagedDb>("INSERT INTO project_databases(project_id,name,username,host,port) VALUES($1,$2,$3,$4,$5) RETURNING id,name,username,host,port,created_at",
    [project.id,name,username,host,port]);
  await query(`INSERT INTO project_env(project_id,key,value_enc,secret) VALUES($1,'DATABASE_URL',$2,true)
    ON CONFLICT(project_id,key) DO UPDATE SET value_enc=EXCLUDED.value_enc,secret=true,updated_at=NOW()`,[project.id,encrypt(url)]);
  await audit(user.id,"PROJECT_DATABASE_PROVISIONED","project",project.id,{database:name,username});
  return NextResponse.json(record,{status:201});
}
