import { createDecipheriv } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import Redis from "ioredis";

const execFileAsync=promisify(execFile);
const {Pool}=pg;
const db=new Pool({connectionString:process.env.DATABASE_URL,max:4});
const redis=new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:null});
let stopping=false;

function masterKey(){
  const key=Buffer.from(process.env.MASTER_KEY||"","base64");
  if(key.length!==32) throw new Error("MASTER_KEY must be 32 random bytes encoded as base64");
  return key;
}

function decrypt(payload){
  const [version,iv64,tag64,data64]=String(payload).split(":");
  if(version!=="v1"||!iv64||!tag64||!data64) throw new Error("Invalid encrypted payload");
  const decipher=createDecipheriv("aes-256-gcm",masterKey(),Buffer.from(iv64,"base64"));
  decipher.setAuthTag(Buffer.from(tag64,"base64"));
  return Buffer.concat([decipher.update(Buffer.from(data64,"base64")),decipher.final()]).toString("utf8");
}

async function sql(text,params=[]){
  const result=await db.query(text,params);
  return result.rows;
}

async function addLog(id,message,level="INFO"){
  const clean=String(message).replace(/(https?:\/\/)[^:@/\s]+:[^@/\s]+@/g,"$1***:***@").slice(0,12000);
  await db.query("INSERT INTO deployment_logs(deployment_id,level,message) VALUES($1,$2,$3)",[id,level,clean]);
  console.log("["+id+"]",clean);
}

async function run(command,args,options={}){
  const result=await execFileAsync(command,args,{maxBuffer:12*1024*1024,...options});
  return {stdout:String(result.stdout||""),stderr:String(result.stderr||"")};
}

async function runWithInput(command,args,input){
  await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{stdio:["pipe","pipe","pipe"]});
    let stderr="";
    child.stderr.on("data",d=>stderr+=d);
    child.on("error",reject);
    child.on("close",code=>code===0?resolve():reject(new Error(stderr||command+" exited "+code)));
    child.stdin.end(input);
  });
}

function authenticatedRepoUrl(raw){
  try{
    const url=new URL(raw);
    const forgejo=process.env.FORGEJO_PUBLIC_URL?new URL(process.env.FORGEJO_PUBLIC_URL):null;
    if(forgejo && url.host===forgejo.host && process.env.FORGEJO_USER && process.env.FORGEJO_PASSWORD){
      url.username=process.env.FORGEJO_USER;
      url.password=process.env.FORGEJO_PASSWORD;
    }
    return url.toString();
  }catch{return raw;}
}

async function registryLogin(){
  const host=process.env.REGISTRY_HOST;
  const user=process.env.REGISTRY_USER;
  const password=process.env.REGISTRY_PASSWORD;
  if(!host||!user||!password) throw new Error("Registry credentials are not configured");
  await runWithInput("docker",["login",host,"--username",user,"--password-stdin"],password+"\n");
}

async function processDeployment(deploymentId){
  const rows=await sql(`SELECT d.id,d.requested_commit,d.commit_sha prebuilt_commit,d.image prebuilt_image,d.environment,d.target_slug,d.target_branch,d.target_domain,
    p.id project_id,p.name,p.slug,p.repo_url,p.branch,p.dockerfile,p.domain,p.container_port,p.health_path,
    s.id server_id,s.base_url,s.agent_token_enc
    FROM deployments d JOIN projects p ON p.id=d.project_id LEFT JOIN servers s ON s.id=p.server_id WHERE d.id=$1`,[deploymentId]);
  const job=rows[0];
  if(!job) return;
  if(!job.server_id) throw new Error("No deployment server assigned");
  const deploySlug=job.target_slug||job.slug;
  const deployBranch=job.target_branch||job.branch;
  const deployDomain=job.target_domain||job.domain;
  const deployEnvironment=job.environment||"production";

  const workspace=await fs.mkdtemp(path.join(process.env.BUILD_WORKSPACE||os.tmpdir(),"mygithub-build-"));
  const source=path.join(workspace,"source");
  try{
    let sha=job.prebuilt_commit||null;
    let image=job.prebuilt_image||null;

    if(image&&sha){
      await db.query("UPDATE deployments SET status='DEPLOYING',started_at=NOW(),error=NULL WHERE id=$1",[deploymentId]);
      await addLog(deploymentId,"Rollback release: reusing immutable image "+image);
      await registryLogin();
      await run("docker",["pull",image]);
    }else{
      await db.query("UPDATE deployments SET status='BUILDING',started_at=NOW(),error=NULL WHERE id=$1",[deploymentId]);
      await addLog(deploymentId,"Cloning "+job.repo_url+" branch "+deployBranch);
      await run("git",["clone","--depth","1","--branch",deployBranch,authenticatedRepoUrl(job.repo_url),source]);

      if(job.requested_commit){
        const current=await run("git",["rev-parse","HEAD"],{cwd:source});
        if(current.stdout.trim()!==job.requested_commit){
          await run("git",["fetch","origin",job.requested_commit,"--depth","1"],{cwd:source});
          await run("git",["checkout","--detach",job.requested_commit],{cwd:source});
        }
      }

      const revision=await run("git",["rev-parse","HEAD"],{cwd:source});
      sha=revision.stdout.trim();
      const registry=process.env.REGISTRY_HOST;
      const namespace=process.env.REGISTRY_NAMESPACE;
      if(!registry||!namespace) throw new Error("REGISTRY_HOST and REGISTRY_NAMESPACE are required");
      image=registry+"/"+namespace+"/"+job.slug+":"+sha.slice(0,12);

      await db.query("UPDATE deployments SET commit_sha=$1,image=$2 WHERE id=$3",[sha,image,deploymentId]);
      await addLog(deploymentId,"Building immutable image "+image);
      await run("docker",["build","--pull","-f",job.dockerfile,"-t",image,"."],{cwd:source});

      await db.query("UPDATE deployments SET status='PUSHING' WHERE id=$1",[deploymentId]);
      await addLog(deploymentId,"Pushing image to private registry");
      await registryLogin();
      await run("docker",["push",image]);
    }

    const [envRows,volumeRows]=await Promise.all([
      sql(
        "SELECT key,value_enc,environment FROM project_env WHERE project_id=$1 AND environment IN ('all',$2) ORDER BY CASE WHEN environment='all' THEN 0 ELSE 1 END,key",
        [job.project_id,deployEnvironment]
      ),
      sql("SELECT name,mount_path FROM project_volumes WHERE project_id=$1 ORDER BY name",[job.project_id])
    ]);
    const environment={};
    for(const row of envRows) environment[row.key]=decrypt(row.value_enc);
    const mounts=volumeRows.map(row=>({name:row.name,mountPath:row.mount_path}));

    await db.query("UPDATE deployments SET status='DEPLOYING' WHERE id=$1",[deploymentId]);
    await addLog(deploymentId,"Starting health-checked candidate on "+job.base_url);
    const token=decrypt(job.agent_token_enc);
    const response=await fetch(job.base_url.replace(/\/$/,"")+"/deploy",{
      method:"POST",
      headers:{"authorization":"Bearer "+token,"content-type":"application/json"},
      body:JSON.stringify({
        projectSlug:deploySlug,
        deploymentId,
        image,
        domain:deployDomain,
        containerPort:job.container_port,
        healthPath:job.health_path,
        env:environment,
        mounts
      }),
      signal:AbortSignal.timeout(180000)
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(result.error||"Deployment agent rejected release");

    await addLog(deploymentId,"Traffic switched to "+sha.slice(0,12)+" on "+deployDomain+" after successful health check");
    await db.query("UPDATE deployments SET status='HEALTHY',finished_at=NOW() WHERE id=$1",[deploymentId]);
    await db.query("UPDATE servers SET status='ONLINE',last_seen=NOW(),updated_at=NOW() WHERE id=$1",[job.server_id]);
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    await addLog(deploymentId,message,"ERROR");
    await db.query("UPDATE deployments SET status='FAILED',error=$1,finished_at=NOW() WHERE id=$2",[message.slice(0,2000),deploymentId]);
    throw error;
  }finally{
    await fs.rm(workspace,{recursive:true,force:true}).catch(()=>{});
  }
}

async function pollServers(){
  try{
    const servers=await sql("SELECT id,base_url,agent_token_enc FROM servers ORDER BY id");
    await Promise.all(servers.map(async server=>{
      let online=false;
      try{
        const token=decrypt(server.agent_token_enc);
        const response=await fetch(server.base_url.replace(/\/$/,"")+"/health",{
          headers:{authorization:"Bearer "+token},
          signal:AbortSignal.timeout(5000)
        });
        online=response.ok;
      }catch{}
      await db.query(
        "UPDATE servers SET status=$1,last_seen=CASE WHEN $1='ONLINE' THEN NOW() ELSE last_seen END,updated_at=NOW() WHERE id=$2",
        [online?"ONLINE":"OFFLINE",server.id]
      );
    }));
  }catch(error){
    console.error("server heartbeat failed",error);
  }
}

setInterval(pollServers,30_000).unref();
await pollServers();

async function loop(){
  console.log("Deployment worker online");
  while(!stopping){
    const item=await redis.brpop("deploy:queue",5);
    if(!item) continue;
    try{
      const payload=JSON.parse(item[1]);
      if(Number.isSafeInteger(Number(payload.deploymentId))) await processDeployment(Number(payload.deploymentId));
    }catch(error){
      console.error("worker job failed",error);
    }
  }
}

for(const signal of ["SIGTERM","SIGINT"]){
  process.on(signal,()=>{stopping=true;});
}

await loop();
await Promise.allSettled([db.end(),redis.quit()]);
