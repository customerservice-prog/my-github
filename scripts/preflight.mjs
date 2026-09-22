import dns from "node:dns/promises";

const required = [
  "CONTROL_DOMAIN","GIT_DOMAIN","STORAGE_DOMAIN","STORAGE_CONSOLE_DOMAIN","GRAFANA_DOMAIN","STATUS_DOMAIN",
  "ACME_EMAIL","SESSION_SECRET","INTERNAL_API_TOKEN","MASTER_KEY","WEBHOOK_SECRET",
  "POSTGRES_PASSWORD","FORGEJO_DB_PASSWORD","FORGEJO_ADMIN_PASSWORD",
  "APP_DB_ADMIN_PASSWORD","MINIO_ROOT_PASSWORD","GRAFANA_ADMIN_PASSWORD",
  "LOCAL_AGENT_TOKEN","RESTIC_PASSWORD"
];

const problems=[];
const warnings=[];

function value(key){return String(process.env[key]||"").trim();}
function domainOk(v){return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(v);}

for(const key of required){
  const v=value(key);
  if(!v) problems.push(key+" is missing");
  if(/replace-|example\.com|change-this/i.test(v)) problems.push(key+" still contains a placeholder value");
}

for(const key of ["CONTROL_DOMAIN","GIT_DOMAIN","STORAGE_DOMAIN","STORAGE_CONSOLE_DOMAIN","GRAFANA_DOMAIN","STATUS_DOMAIN"]){
  if(value(key) && !domainOk(value(key))) problems.push(key+" is not a valid hostname");
}

if(value("PREVIEW_BASE_DOMAIN") && !domainOk(value("PREVIEW_BASE_DOMAIN"))){
  problems.push("PREVIEW_BASE_DOMAIN is not a valid hostname");
}

if(value("SESSION_SECRET").length<32) problems.push("SESSION_SECRET must be at least 32 characters");
if(value("INTERNAL_API_TOKEN").length<32) problems.push("INTERNAL_API_TOKEN must be at least 32 characters");
if(value("LOCAL_AGENT_TOKEN").length<24) problems.push("LOCAL_AGENT_TOKEN must be at least 24 characters");
if(value("WEBHOOK_SECRET").length<24) problems.push("WEBHOOK_SECRET must be at least 24 characters");

try{
  if(Buffer.from(value("MASTER_KEY"),"base64").length!==32) problems.push("MASTER_KEY must decode to exactly 32 bytes");
}catch{
  problems.push("MASTER_KEY is not valid base64");
}

const domains=["CONTROL_DOMAIN","GIT_DOMAIN","STORAGE_DOMAIN","STORAGE_CONSOLE_DOMAIN","GRAFANA_DOMAIN","STATUS_DOMAIN"]
  .map(key=>[key,value(key)])
  .filter(([,v])=>v);
const seen=new Map();
for(const [key,host] of domains){
  if(seen.has(host)) problems.push(key+" duplicates "+seen.get(host)+" ("+host+")");
  else seen.set(host,key);
}

const highValueSecrets=["SESSION_SECRET","INTERNAL_API_TOKEN","WEBHOOK_SECRET","LOCAL_AGENT_TOKEN","RESTIC_PASSWORD"];
for(let i=0;i<highValueSecrets.length;i++){
  for(let j=i+1;j<highValueSecrets.length;j++){
    if(value(highValueSecrets[i]) && value(highValueSecrets[i])===value(highValueSecrets[j])){
      problems.push(highValueSecrets[i]+" and "+highValueSecrets[j]+" must not reuse the same secret");
    }
  }
}

if(value("RESTIC_REPOSITORY")==="/repository") warnings.push("RESTIC_REPOSITORY is local-only. Configure off-site storage before trusting this for disaster recovery.");
if(!value("ALERT_WEBHOOK_URL")) warnings.push("ALERT_WEBHOOK_URL is empty; health transitions will be recorded but not pushed externally.");

for(const [,host] of domains){
  if(!domainOk(host)) continue;
  try{
    await dns.lookup(host);
  }catch{
    problems.push("DNS does not currently resolve: "+host);
  }
}
if(value("PREVIEW_BASE_DOMAIN") && domainOk(value("PREVIEW_BASE_DOMAIN"))){
  const probe="preflight-"+Date.now()+"."+value("PREVIEW_BASE_DOMAIN");
  try{
    await dns.lookup(probe);
  }catch{
    warnings.push("Wildcard preview DNS did not resolve for "+probe+". Branch previews will not work until *."+value("PREVIEW_BASE_DOMAIN")+" points at the deployment server.");
  }
}

for(const warning of warnings) console.warn("WARN:",warning);
if(problems.length){
  for(const problem of problems) console.error("ERROR:",problem);
  console.error("\nPreflight failed with "+problems.length+" blocking problem(s).");
  process.exit(1);
}
console.log("Production preflight passed.");
