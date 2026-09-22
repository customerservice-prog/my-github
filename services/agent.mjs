import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

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

async function activeContainers(slug){
  const out=await docker(["ps","-a","--filter","label=mygithub.project="+slug,"--format","{{.Names}}"]);
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
  if(!validSlug(projectSlug)) throw new Error("Invalid project slug");
  if(!Number.isSafeInteger(deploymentId)||deploymentId<1) throw new Error("Invalid deployment id");
  if(!image||image.length>500||/\s/.test(image)) throw new Error("Invalid image");
  if(!validDomain(domain)) throw new Error("Invalid domain");
  if(!Number.isSafeInteger(containerPort)||containerPort<1||containerPort>65535) throw new Error("Invalid container port");
  if(!validHealth(healthPath)) throw new Error("Invalid health path");
  for(const [key,value] of Object.entries(env)){
    if(!/^[A-Z_][A-Z0-9_]*$/.test(key)) throw new Error("Invalid environment key");
    if(String(value).includes("\n")) throw new Error("Multiline environment values are not supported by this agent");
  }

  await ensureNetwork();
  await docker(["pull",image]);
  const name=projectSlug+"-"+deploymentId;
  const old=await activeContainers(projectSlug);
  await docker(["rm","-f",name]).catch(()=>{});

  const envPath="/tmp/"+name+".env";
  const envText=Object.entries(env).map(([k,v])=>k+"="+String(v).replace(/\r/g,"")).join("\n")+"\n";
  await fs.writeFile(envPath,envText,{mode:0o600});
  try{
    await docker([
      "run","-d",
      "--name",name,
      "--restart","unless-stopped",
      "--network",network,
      "--label","mygithub.project="+projectSlug,
      "--label","mygithub.deployment="+deploymentId,
      "--env-file",envPath,
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

async function currentContainer(slug){
  const names=await activeContainers(slug);
  for(const name of names){
    const running=await docker(["inspect","-f","{{.State.Running}}",name]).catch(()=>"false");
    if(running==="true") return name;
  }
  return null;
}

const server=http.createServer(async(req,res)=>{
  try{
    if(!authorized(req)) return send(res,401,{error:"Unauthorized"});
    const url=new URL(req.url||"/","http://agent.local");

    if(req.method==="GET"&&url.pathname==="/health"){
      const version=await docker(["version","--format","{{.Server.Version}}"]);
      return send(res,200,{status:"ok",docker:version,hostname:process.env.HOSTNAME||"agent"});
    }

    if(req.method==="POST"&&url.pathname==="/deploy"){
      return send(res,200,await deploy(await readBody(req)));
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
