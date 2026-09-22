import dns from "node:dns/promises";
import net from "node:net";

function privateV4(ip:string){
  const parts=ip.split(".").map(Number);
  if(parts.length!==4||parts.some(n=>!Number.isInteger(n)||n<0||n>255)) return true;
  const [a,b]=parts;
  return a===10
    || a===127
    || (a===169&&b===254)
    || (a===172&&b>=16&&b<=31)
    || (a===192&&b===168)
    || (a===100&&b>=64&&b<=127)
    || (a===192&&b===0)
    || (a===198&&(b===18||b===19))
    || a===0
    || a>=224;
}

function privateV6(ip:string){
  const value=ip.toLowerCase();
  if(value.startsWith("::ffff:")){
    const mapped=value.slice(7);
    if(net.isIP(mapped)===4) return privateV4(mapped);
  }
  return value==="::1"
    || value==="::"
    || value.startsWith("fc")
    || value.startsWith("fd")
    || value.startsWith("fe8")
    || value.startsWith("fe9")
    || value.startsWith("fea")
    || value.startsWith("feb");
}

export async function assertPublicHttpsGitUrl(raw:string){
  const url=new URL(raw);
  if(url.protocol!=="https:") throw new Error("Repository imports must use HTTPS");
  if(url.username||url.password) throw new Error("Embedded repository credentials are not allowed");
  const host=url.hostname.toLowerCase();
  if(host==="localhost"||host.endsWith(".localhost")) throw new Error("Local repository URLs are not allowed");
  const allowedHosts=(process.env.GIT_IMPORT_HOSTS||"github.com,gitlab.com,bitbucket.org,codeberg.org")
    .split(",").map(value=>value.trim().toLowerCase()).filter(Boolean);
  if(!allowedHosts.includes(host)) throw new Error("Repository host is not in GIT_IMPORT_HOSTS");

  const records=await dns.lookup(host,{all:true,verbatim:true});
  if(!records.length) throw new Error("Repository host did not resolve");
  for(const record of records){
    const kind=net.isIP(record.address);
    if(kind===4&&privateV4(record.address)) throw new Error("Repository host resolves to a private or reserved address");
    if(kind===6&&privateV6(record.address)) throw new Error("Repository host resolves to a private or reserved address");
    if(kind===0) throw new Error("Repository host returned an invalid address");
  }
  return url.toString();
}

export function assertForgejoProjectUrl(raw:string){
  const publicUrl=process.env.FORGEJO_PUBLIC_URL;
  if(!publicUrl) throw new Error("FORGEJO_PUBLIC_URL is required");
  const candidate=new URL(raw);
  const forgejo=new URL(publicUrl);
  if(candidate.protocol!=="https:"&&process.env.NODE_ENV==="production") throw new Error("Project repository must use HTTPS");
  if(candidate.hostname!==forgejo.hostname) throw new Error("Projects must deploy from the configured Forgejo host");
  if(candidate.username||candidate.password) throw new Error("Project repository URL cannot embed credentials");
  return candidate.toString();
}
