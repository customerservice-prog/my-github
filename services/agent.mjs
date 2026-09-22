import http from "node:http";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const execFileAsync=promisify(execFile);
const port=Number(process.env.AGENT_PORT||7001);
const token=process.env.AGENT_TOKEN||"";
const dynamicDir=process.env.TRAEFIK_DYNAMIC_DIR||"/dynamic";
const network=process.env.PROXY_NETWORK||"platform-proxy";
const certResolver=process.env.CERT_RESOLVER||"letsencrypt";

function authorized(req){
  const supplied=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  return token.length>=24 && supplied===token;
}

function validSlug(v){return /^[a-z0-9][a-z0-9-]{0,62}$/.test(v);}
function validDomain(v){return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(v);}
function validHealth(v){return /^\/[A-Za-z0-9_\-./?=&%]*$/.test(v);}

async function docker(args){
  const result=await execFileAsync("docker",args,{maxBuffer:12*1024*1024});
  return String(result.stdout||"").trim();
}

async function dockerWithEnv(args,extraEnv={}){
  const result=await execFileAsync("docker",args,{maxBuffer:12*1024*1024,env:{...process.env,...extraEnv}});
  return String(result.stdout||"").trim();
}

async function dockerWithInput(args,input,extraEnv={}){
  await new Promise((resolve,reject)=>{
    const child=spawn("docker",args,{stdio:["pipe","pipe","pipe"],env:{...process.env,...extraEnv}});
    let stderr="";
    child.stderr.on("data",chunk=>stderr+=chunk);
    child.on("error",reject);
    child.on("close",code=>code===0?resolve():reject(new Error(stderr||"docker exited "+code)));
    child.stdin.end(input);
  });
}

function minioHost(){
  const endpoint=process.env.STORAGE_ENDPOINT_INTERNAL||"http://minio:9000";
  const user=process.env.MINIO_ROOT_USER||"";
  const password=process.env.MINIO_ROOT_PASSWORD||"";
  if(!user||!password) throw new Error("MinIO administrator credentials are not configured");
  const url=new URL(endpoint);
  url.username=user;
  url.password=password;
  return url.toString();
}

async function provisionStorage({projectSlug,bucket,accessKey,secretKey}){
  if(!validSlug(projectSlug)) throw new Error("Invalid project slug");
  if(!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error("Invalid bucket name");
  if(!/^[A-Z0-9]{16,32}$/.test(accessKey)) throw new Error("Invalid object storage access key");
  if(secretKey.length<32||secretKey.length>80) throw new Error("Invalid object storage secret key");
  const image=process.env.MINIO_MC_IMAGE||"minio/mc:latest";
  const common=["run","--rm","--network","platform-control","-e","MC_HOST_local"];
  const hostEnv={MC_HOST_local:minioHost()};

  await dockerWithEnv([...common,image,"mb","--ignore-existing","local/"+bucket],hostEnv);

  await dockerWithEnv([
    ...common,
    "-e","PROJECT_ACCESS_KEY",
    "-e","PROJECT_SECRET_KEY",
    "--entrypoint","/bin/sh",
    image,
    "-c",'mc admin user add local "$PROJECT_ACCESS_KEY" "$PROJECT_SECRET_KEY"'
  ],{...hostEnv,PROJECT_ACCESS_KEY:accessKey,PROJECT_SECRET_KEY:secretKey});

  const policyName=("bucket-"+projectSlug+"-"+accessKey.slice(-8)).toLowerCase();
  const policy=JSON.stringify({
    Version:"2012-10-17",
    Statement:[
      {Effect:"Allow",Action:["s3:ListBucket","s3:GetBucketLocation","s3:ListBucketMultipartUploads"],Resource:["arn:aws:s3:::"+bucket]},
      {Effect:"Allow",Action:["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:AbortMultipartUpload","s3:ListMultipartUploadParts"],Resource:["arn:aws:s3:::"+bucket+"/*"]}
    ]
  });

  await dockerWithInput([
    ...common,
    "-e","POLICY_NAME",
    "--entrypoint","/bin/sh",
    image,
    "-c",'mc admin policy create local "$POLICY_NAME" /dev/stdin'
  ],policy,{...hostEnv,POLICY_NAME:policyName});

  await dockerWithEnv([
    ...common,
    "-e","PROJECT_ACCESS_KEY",
    "-e","POLICY_NAME",
    "--entrypoint","/bin/sh",
    image,
    "-c",'mc admin policy attach local "$POLICY_NAME" --user "$PROJECT_ACCESS_KEY"'
  ],{...hostEnv,PROJECT_ACCESS_KEY:accessKey,POLICY_NAME:policyName});

  return {
    ok:true,
    bucket,
    endpoint:process.env.STORAGE_PUBLIC_URL||process.env.STORAGE_ENDPOINT_INTERNAL||"http://minio:9000"
  };
}

async function writeEnvFile(name,env){
  const envPath="/tmp/"+name+".env";
  const envText=Object.entries(env).map(([k,v])=>k+"="+String(v).replace(/\r/g,"")).join("\n")+"\n";
  await fs.writeFile(envPath,envText,{mode:0o600});
  return envPath;
}

async function volumeArgs(projectSlug,mounts){
  const args=[];
  for(const mount of mounts){
    const volumeName="mygithub-"+projectSlug+"-"+mount.name;
    await docker(["volume","create","--label","mygithub.project="+projectSlug,volumeName]);
    args.push("--mount","type=volume,src="+volumeName+",dst="+mount.mountPath);
  }
  return args;
}

function validateRuntimeEnv(env,mounts){
  for(const [key,value] of Object.entries(env)){
    if(!/^[A-Z_][A-Z0-9_]*$/.test(key)) throw new Error("Invalid environment key");
    if(String(value).includes("\n")) throw new Error("Multiline environment values are not supported by this agent");
  }
  for(const mount of mounts){
    if(!mount||!validSlug(String(mount.name||""))) throw new Error("Invalid volume name");
    const target=String(mount.mountPath||"");
    if(!/^\/[A-Za-z0-9._/-]+$/.test(target)||target.split("/").includes("..")) throw new Error("Invalid volume mount path");
  }
}

async function ensureNetwork(){
  try{await docker(["network","inspect",network]);}
  catch{await docker(["network","create",network]);}
}

async function readBody(req,max=1024*1024){
  let size=0;
  const chunks=[];
  for await(const chunk of req){
    size+=chunk.length;
    if(size>max) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");
}

function send(res,status,body){
  res.writeHead(status,{"content-type":"application/json","cache-control":"no-store"});
  res.end(JSON.stringify(body));
}

function sendHtml(res,status,html){
  res.writeHead(status,{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-robots-tag":"noindex, nofollow"});
  res.end(html);
}

async function activeContainers(slug,kind=null){
  const args=["ps","-a","--filter","label=mygithub.project="+slug];
  if(kind) args.push("--filter","label=mygithub.kind="+kind);
  args.push("--format","{{.Names}}");
  const out=await docker(args);
  return out?out.split("\n").filter(Boolean):[];
}

async function waitHealthy(container,containerPort,healthPath){
  const url="http://"+container+":"+containerPort+healthPath;
  const deadline=Date.now()+90_000;
  let lastError="not ready";
  while(Date.now()<deadline){
    try{
      const response=await fetch(url,{signal:AbortSignal.timeout(3500),headers:{"user-agent":"my-github-agent/1"}});
      if(response.status>=200&&response.status<400) return;
      lastError="HTTP "+response.status;
    }catch(error){lastError=error instanceof Error?error.message:String(error);}
    await new Promise(r=>setTimeout(r,1800));
  }
  throw new Error("Health check failed for "+url+": "+lastError);
}

async function writeRoute(slug,domain,container,containerPort){
  await fs.mkdir(dynamicDir,{recursive:true});
  const safe=slug.replace(/[^a-z0-9-]/g,"");
  const content=[
    "http:",
    "  routers:",
    "    "+safe+":",
    "      rule: \"Host(`"+domain+"`)\"",
    "      entryPoints:",
    "        - websecure",
    "      service: "+safe,
    "      tls:",
    "        certResolver: "+certResolver,
    "  services:",
    "    "+safe+":",
    "      loadBalancer:",
    "        passHostHeader: true",
    "        servers:",
    "          - url: \"http://"+container+":"+containerPort+"\"",
    ""
  ].join("\n");
  const target=path.join(dynamicDir,safe+".yml");
  const temp=target+".tmp";
  await fs.writeFile(temp,content,{mode:0o600});
  await fs.rename(temp,target);
}

async function deploy(body){
  const projectSlug=String(body.projectSlug||"");
  const deploymentId=Number(body.deploymentId);
  const image=String(body.image||"");
  const domain=String(body.domain||"").toLowerCase();
  const containerPort=Number(body.containerPort);
  const healthPath=String(body.healthPath||"/");
  const env=body.env&&typeof body.env==="object"?body.env:{};
  const mounts=Array.isArray(body.mounts)?body.mounts:[];
  if(!validSlug(projectSlug)) throw new Error("Invalid project slug");
  if(!Number.isSafeInteger(deploymentId)||deploymentId<1) throw new Error("Invalid deployment id");
  if(!image||image.length>500||/\s/.test(image)) throw new Error("Invalid image");
  if(!validDomain(domain)) throw new Error("Invalid domain");
  if(!Number.isSafeInteger(containerPort)||containerPort<1||containerPort>65535) throw new Error("Invalid container port");
  if(!validHealth(healthPath)) throw new Error("Invalid health path");
  validateRuntimeEnv(env,mounts);

  await ensureNetwork();
  await docker(["pull",image]);
  const name=projectSlug+"-"+deploymentId;
  const old=await activeContainers(projectSlug,"web");
  await docker(["rm","-f",name]).catch(()=>{});

  const envPath=await writeEnvFile(name,env);
  try{
    const mountArgs=await volumeArgs(projectSlug,mounts);
    await docker([
      "run","-d",
      "--name",name,
      "--restart","unless-stopped",
      "--network",network,
      "--label","mygithub.project="+projectSlug,
      "--label","mygithub.kind=web",
      "--label","mygithub.deployment="+deploymentId,
      "--env-file",envPath,
      ...mountArgs,
      image
    ]);
  }finally{
    await fs.rm(envPath,{force:true}).catch(()=>{});
  }

  try{
    await waitHealthy(name,containerPort,healthPath);
  }catch(error){
    await docker(["rm","-f",name]).catch(()=>{});
    throw error;
  }

  await writeRoute(projectSlug,domain,name,containerPort);
  await new Promise(r=>setTimeout(r,3000));

  for(const previous of old){
    if(previous!==name) await docker(["rm","-f",previous]).catch(()=>{});
  }

  return {ok:true,container:name,image,previous:old.filter(v=>v!==name)};
}

async function writeMaintenanceRoute(slug,domain){
  await fs.mkdir(dynamicDir,{recursive:true});
  const safe=slug.replace(/[^a-z0-9-]/g,"");
  const content=[
    "http:",
    "  routers:",
    "    "+safe+":",
    "      rule: \"Host(\`"+domain+"\`)\"",
    "      entryPoints:",
    "        - websecure",
    "      service: "+safe+"-maintenance",
    "      middlewares:",
    "        - "+safe+"-maintenance-path",
    "      tls:",
    "        certResolver: "+certResolver,
    "  middlewares:",
    "    "+safe+"-maintenance-path:",
    "      replacePath:",
    "        path: /maintenance/"+safe,
    "  services:",
    "    "+safe+"-maintenance:",
    "      loadBalancer:",
    "        servers:",
    "          - url: \"http://agent:"+port+"\"",
    ""
  ].join("\n");
  const target=path.join(dynamicDir,safe+".yml");
  const temp=target+".tmp";
  await fs.writeFile(temp,content,{mode:0o600});
  await fs.rename(temp,target);
}

async function syncWorkers(body){
  const projectSlug=String(body.projectSlug||"");
  const image=String(body.image||"");
  const env=body.env&&typeof body.env==="object"?body.env:{};
  const mounts=Array.isArray(body.mounts)?body.mounts:[];
  const workers=Array.isArray(body.workers)?body.workers:[];
  if(!validSlug(projectSlug)||!image||/\s/.test(image)) throw new Error("Invalid worker target");
  validateRuntimeEnv(env,mounts);
  await ensureNetwork();

  const desired=new Set();
  for(const worker of workers){
    const name=String(worker.name||"");
    const command=String(worker.command||"");
    if(!validSlug(name)||!command||command.length>1000||command.includes("\n")) throw new Error("Invalid worker configuration");
    const container=(projectSlug+"-worker-"+name).slice(0,120);
    desired.add(container);
    await docker(["rm","-f",container]).catch(()=>{});
    const envPath=await writeEnvFile(container,env);
    try{
      const mountArgs=await volumeArgs(projectSlug,mounts);
      await docker([
        "run","-d","--name",container,"--restart","unless-stopped","--network",network,
        "--label","mygithub.project="+projectSlug,
        "--label","mygithub.kind=worker",
        "--label","mygithub.service="+name,
        "--env-file",envPath,
        ...mountArgs,
        image,"/bin/sh","-lc",command
      ]);
    }finally{
      await fs.rm(envPath,{force:true}).catch(()=>{});
    }
  }

  const existing=await docker(["ps","-a","--filter","label=mygithub.project="+projectSlug,"--filter","label=mygithub.kind=worker","--format","{{.Names}}"]).catch(()=>"");
  for(const container of existing.split("\n").filter(Boolean)){
    if(!desired.has(container)) await docker(["rm","-f",container]).catch(()=>{});
  }
  return {ok:true,workers:[...desired]};
}

async function runJob(body){
  const projectSlug=String(body.projectSlug||"");
  const serviceName=String(body.serviceName||"");
  const runId=Number(body.runId);
  const image=String(body.image||"");
  const command=String(body.command||"");
  const env=body.env&&typeof body.env==="object"?body.env:{};
  const mounts=Array.isArray(body.mounts)?body.mounts:[];
  if(!validSlug(projectSlug)||!validSlug(serviceName)||!Number.isSafeInteger(runId)||runId<1) throw new Error("Invalid job target");
  if(!image||/\s/.test(image)||!command||command.length>1000||command.includes("\n")) throw new Error("Invalid job command");
  validateRuntimeEnv(env,mounts);
  await ensureNetwork();

  const name=(projectSlug+"-job-"+serviceName+"-"+runId).slice(0,120);
  await docker(["rm","-f",name]).catch(()=>{});
  const envPath=await writeEnvFile(name,env);
  try{
    const mountArgs=await volumeArgs(projectSlug,mounts);
    const result=await execFileAsync("docker",[
      "run","--rm","--name",name,"--network",network,
      "--label","mygithub.project="+projectSlug,
      "--label","mygithub.kind=cron",
      "--label","mygithub.service="+serviceName,
      "--env-file",envPath,
      ...mountArgs,
      image,"/bin/sh","-lc",command
    ],{maxBuffer:2*1024*1024,timeout:10*60*1000});
    return {ok:true,output:(String(result.stdout||"")+String(result.stderr||"")).slice(-100000)};
  }finally{
    await fs.rm(envPath,{force:true}).catch(()=>{});
  }
}

async function currentContainer(slug){
  const names=await activeContainers(slug,"web");
  for(const name of names){
    const running=await docker(["inspect","-f","{{.State.Running}}",name]).catch(()=>"false");
    if(running==="true") return name;
  }
  return null;
}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||"/","http://agent.local");
    if(req.method==="GET"&&url.pathname.startsWith("/maintenance/")){
      const slug=url.pathname.slice("/maintenance/".length);
      if(!validSlug(slug)) return sendHtml(res,404,"Not found");
      const html="<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Maintenance</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#071019;color:#eef6ff;font-family:system-ui,sans-serif}.card{max-width:560px;margin:24px;padding:42px;border:1px solid #203243;border-radius:22px;background:#0c1722;text-align:center;box-shadow:0 24px 70px #0006}h1{font-size:34px;margin:0 0 12px}p{color:#9db0c2;line-height:1.6;margin:0}</style></head><body><main class=\"card\"><h1>We’ll be right back.</h1><p>This site is temporarily in maintenance mode. Please check back shortly.</p></main></body></html>";
      return sendHtml(res,503,html);
    }
    if(!authorized(req)) return send(res,401,{error:"Unauthorized"});

    if(req.method==="GET"&&url.pathname==="/health"){
      const version=await docker(["version","--format","{{.Server.Version}}"]);
      let disk={totalBytes:null,freeBytes:null};
      try{
        const stats=await fs.statfs("/");
        disk={
          totalBytes:Number(stats.blocks)*Number(stats.bsize),
          freeBytes:Number(stats.bavail)*Number(stats.bsize)
        };
      }catch{}
      const totalMemory=os.totalmem();
      const freeMemory=os.freemem();
      return send(res,200,{
        status:"ok",
        docker:version,
        hostname:os.hostname(),
        uptimeSeconds:Math.round(os.uptime()),
        loadAverage:os.loadavg(),
        memory:{totalBytes:totalMemory,freeBytes:freeMemory,usedPercent:totalMemory?Math.round((1-freeMemory/totalMemory)*1000)/10:null},
        disk
      });
    }

    if(req.method==="POST"&&url.pathname==="/deploy"){
      return send(res,200,await deploy(await readBody(req)));
    }

    if(req.method==="POST"&&url.pathname==="/services/sync"){
      return send(res,200,await syncWorkers(await readBody(req)));
    }

    if(req.method==="POST"&&url.pathname==="/job/run"){
      return send(res,200,await runJob(await readBody(req)));
    }

    if(req.method==="POST"&&url.pathname==="/storage/provision"){
      const body=await readBody(req);
      return send(res,200,await provisionStorage({
        projectSlug:String(body.projectSlug||""),
        bucket:String(body.bucket||""),
        accessKey:String(body.accessKey||""),
        secretKey:String(body.secretKey||"")
      }));
    }

    if(req.method==="POST"&&url.pathname==="/maintenance"){
      const body=await readBody(req);
      const slug=String(body.projectSlug||"");
      const domain=String(body.domain||"").toLowerCase();
      const enabled=Boolean(body.enabled);
      if(!validSlug(slug)||!validDomain(domain)) throw new Error("Invalid maintenance target");
      if(enabled){
        await writeMaintenanceRoute(slug,domain);
        return send(res,200,{ok:true,maintenance:true});
      }
      const name=await currentContainer(slug);
      if(!name) return send(res,409,{error:"No running container available to restore traffic"});
      const targetPort=Number(body.containerPort);
      if(!Number.isSafeInteger(targetPort)||targetPort<1||targetPort>65535) throw new Error("Invalid container port");
      await writeRoute(slug,domain,name,targetPort);
      return send(res,200,{ok:true,maintenance:false,container:name});
    }

    if(req.method==="POST"&&url.pathname==="/remove"){
      const body=await readBody(req);
      const slug=String(body.projectSlug||"");
      if(!validSlug(slug)) throw new Error("Invalid project slug");
      const names=await activeContainers(slug);
      for(const name of names) await docker(["rm","-f",name]).catch(()=>{});
      await fs.rm(path.join(dynamicDir,slug+".yml"),{force:true}).catch(()=>{});
      if(Boolean(body.removeVolumes)){
        const volumes=await docker(["volume","ls","--filter","label=mygithub.project="+slug,"-q"]).catch(()=>"");
        for(const volume of volumes.split("\n").filter(Boolean)){
          await docker(["volume","rm",volume]).catch(()=>{});
        }
      }
      return send(res,200,{ok:true,removedContainers:names.length});
    }

    if(req.method==="POST"&&url.pathname==="/restart"){
      const body=await readBody(req);
      const slug=String(body.projectSlug||"");
      if(!validSlug(slug)) throw new Error("Invalid project slug");
      const name=await currentContainer(slug);
      if(!name) return send(res,404,{error:"No active container"});
      await docker(["restart",name]);
      return send(res,200,{ok:true,container:name});
    }

    if(req.method==="GET"&&url.pathname==="/status"){
      const slug=String(url.searchParams.get("project")||"");
      if(!validSlug(slug)) throw new Error("Invalid project slug");
      const name=await currentContainer(slug);
      if(!name) return send(res,200,{status:"STOPPED",container:null});
      const inspect=await docker(["inspect","-f","{{json .State}}",name]);
      const state=JSON.parse(inspect||"{}");
      let maintenance=false;
      try{
        const route=await fs.readFile(path.join(dynamicDir,slug+".yml"),"utf8");
        maintenance=route.includes(slug+"-maintenance");
      }catch{}
      return send(res,200,{
        status:state.Running?"RUNNING":"STOPPED",
        container:name,
        maintenance,
        startedAt:state.StartedAt||null,
        restartCount:Number(await docker(["inspect","-f","{{.RestartCount}}",name]).catch(()=>"0"))||0
      });
    }

    if(req.method==="GET"&&url.pathname==="/logs"){
      const slug=String(url.searchParams.get("project")||"");
      const lines=Math.min(1000,Math.max(1,Number(url.searchParams.get("lines")||200)));
      if(!validSlug(slug)) throw new Error("Invalid project slug");
      const name=await currentContainer(slug);
      if(!name) return send(res,404,{error:"No active container"});
      const logs=await docker(["logs","--tail",String(lines),name]);
      return send(res,200,{container:name,logs});
    }

    return send(res,404,{error:"Not found"});
  }catch(error){
    console.error(error);
    return send(res,500,{error:error instanceof Error?error.message:"Agent error"});
  }
});

server.listen(port,"0.0.0.0",()=>console.log("Deployment agent listening on "+port));

for(const signal of ["SIGINT","SIGTERM"]){
  process.on(signal,()=>server.close(()=>process.exit(0)));
}
