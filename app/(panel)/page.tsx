import Link from "next/link";
import { query, one } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { StatusPill } from "@/components/StatusPill";

type CountRow={count:string};
type DeploymentRow={id:number;status:string;queued_at:string;commit_sha:string|null;image:string|null;project_name:string;project_id:number};
type ServerRow={id:number;name:string;status:string;last_seen:string|null};
type BackupRow={status:string;created_at:string;snapshot_id:string|null};

export default async function DashboardPage() {
  const [projects, deployments, servers, recent, serverRows, backup] = await Promise.all([
    one<CountRow>("SELECT COUNT(*)::text count FROM projects"),
    one<CountRow>("SELECT COUNT(*)::text count FROM deployments WHERE queued_at > NOW()-INTERVAL '24 hours'"),
    one<CountRow>("SELECT COUNT(*)::text count FROM servers"),
    query<DeploymentRow>("SELECT d.id,d.status,d.queued_at,d.commit_sha,d.image,p.name project_name,p.id project_id FROM deployments d JOIN projects p ON p.id=d.project_id ORDER BY d.id DESC LIMIT 8"),
    query<ServerRow>("SELECT id,name,status,last_seen FROM servers ORDER BY id"),
    one<BackupRow>("SELECT status,created_at,snapshot_id FROM backups ORDER BY id DESC LIMIT 1")
  ]);
  const healthy = serverRows.filter(s=>s.status==="ONLINE").length;
  return <>
    <header className="page-header">
      <div><div className="eyebrow">CONTROL PLANE</div><h1>Everything you run, in one place.</h1><p>Private source control, build automation, deployments, servers, storage and recovery.</p></div>
      <Link href="/projects" className="primary-button">New project</Link>
    </header>
    <section className="grid stats-grid">
      <div className="card stat-card"><div className="label">Projects</div><div className="value">{projects?.count ?? "0"}</div><div className="sub">Production workloads</div></div>
      <div className="card stat-card"><div className="label">Deployments · 24h</div><div className="value">{deployments?.count ?? "0"}</div><div className="sub">Queued, built and released</div></div>
      <div className="card stat-card"><div className="label">Servers online</div><div className="value">{healthy}/{servers?.count ?? "0"}</div><div className="sub">Deployment nodes reporting</div></div>
      <div className="card stat-card"><div className="label">Latest backup</div><div className="value" style={{fontSize:20}}>{backup?.status ?? "None"}</div><div className="sub">{backup ? formatDate(backup.created_at) : "No completed snapshot yet"}</div></div>
    </section>
    <section className="grid two-col">
      <div className="card">
        <div className="card-header"><h2>Recent deployments</h2><Link className="repo-link small" href="/deployments">View all →</Link></div>
        {recent.length ? <div className="table-wrap"><table><thead><tr><th>Project</th><th>Status</th><th>Commit</th><th>Queued</th></tr></thead><tbody>
          {recent.map(d=><tr key={d.id}><td><Link href={"/projects/"+d.project_id} className="row-title repo-link">{d.project_name}</Link><div className="row-sub">Deployment #{d.id}</div></td><td><StatusPill status={d.status}/></td><td><code>{d.commit_sha?.slice(0,8) ?? "pending"}</code></td><td>{formatDate(d.queued_at)}</td></tr>)}
        </tbody></table></div> : <div className="empty">No deployments yet. Create a project and ship the first build.</div>}
      </div>
      <div className="card">
        <div className="card-header"><h2>Server fleet</h2><Link className="repo-link small" href="/servers">Manage →</Link></div>
        <div className="card-body stack">
          {serverRows.length ? serverRows.map(s=><div className="row-between" key={s.id}><div><strong className="small">{s.name}</strong><div className="row-sub">{s.last_seen ? "Seen "+formatDate(s.last_seen) : "Not checked yet"}</div></div><StatusPill status={s.status}/></div>) : <div className="empty">No deployment servers registered.</div>}
        </div>
      </div>
    </section>
  </>;
}
