import { one } from "@/lib/db";
import { StatusPill } from "@/components/StatusPill";
import { formatDate } from "@/lib/utils";

export const dynamic="force-dynamic";

type CountRow={count:string};
type Backup={status:string;created_at:string};
type Check={status:string};

async function reachable(url:string){
  try{
    const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(4000)});
    return response.ok;
  }catch{return false;}
}

export default async function PublicStatusPage(){
  const [serverTotal,serverOffline,latestBackup,latestBad,gitOk,storageOk]=await Promise.all([
    one<CountRow>("SELECT COUNT(*)::text count FROM servers"),
    one<CountRow>("SELECT COUNT(*)::text count FROM servers WHERE status <> 'ONLINE'"),
    one<Backup>("SELECT status,created_at FROM backups ORDER BY id DESC LIMIT 1"),
    one<Check>(`SELECT status FROM (
      SELECT DISTINCT ON(project_id,environment) project_id,environment,status
      FROM project_health_checks ORDER BY project_id,environment,checked_at DESC
    ) x WHERE status <> 'HEALTHY' LIMIT 1`),
    reachable((process.env.FORGEJO_INTERNAL_URL||"http://forgejo:3000").replace(/\/$/,"")+"/api/v1/version"),
    reachable("http://minio:9000/minio/health/live")
  ]);

  const nodesOk=Number(serverTotal?.count||0)>0 && Number(serverOffline?.count||0)===0;
  const appsOk=!latestBad;
  const backupOk=latestBackup?.status==="SUCCESS" && Date.now()-new Date(latestBackup.created_at).getTime()<24*60*60*1000;
  const overall=gitOk&&storageOk&&nodesOk&&appsOk&&backupOk;

  const rows=[
    ["Git service",gitOk,"Forgejo source control and registry"],
    ["Deployment nodes",nodesOk,(serverTotal?.count||"0")+" registered node(s)"],
    ["Applications",appsOk,"Latest public production/staging health checks"],
    ["Object storage",storageOk,"S3-compatible storage health"],
    ["Backups",backupOk,latestBackup?latestBackup.status+" · "+formatDate(latestBackup.created_at):"No successful backup recorded"]
  ] as const;

  return <main className="public-status-page">
    <section className="status-hero">
      <div className="brand"><div className="brand-mark">MG</div><div><strong>{process.env.PLATFORM_NAME||"My GitHub"}</strong><span>System Status</span></div></div>
      <div className="status-summary">
        <StatusPill status={overall?"HEALTHY":"DEGRADED"}/>
        <h1>{overall?"All monitored systems operational":"Some monitored systems need attention"}</h1>
        <p>No project secrets, customer information, repository names, or private infrastructure addresses are exposed on this page.</p>
      </div>
      <div className="card status-list">
        {rows.map(([name,ok,detail])=><div className="status-service" key={name}><div><strong>{name}</strong><span>{detail}</span></div><StatusPill status={ok?"HEALTHY":"DEGRADED"}/></div>)}
      </div>
      <div className="tiny muted">Status refreshes when this page is loaded.</div>
    </section>
  </main>;
}
