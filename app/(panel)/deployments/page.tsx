import Link from "next/link";
import { query } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { StatusPill } from "@/components/StatusPill";

type Deployment={id:number;status:string;project_id:number;project_name:string;commit_sha:string|null;image:string|null;error:string|null;queued_at:string;started_at:string|null;finished_at:string|null};

export default async function DeploymentsPage(){
  const rows=await query<Deployment>("SELECT d.*,p.name project_name FROM deployments d JOIN projects p ON p.id=d.project_id ORDER BY d.id DESC LIMIT 200");
  return <>
    <header className="page-header"><div><div className="eyebrow">DELIVERY PIPELINE</div><h1>Deployments</h1><p>Every build is immutable, logged and tied to a commit and container image for fast rollback.</p></div></header>
    <section className="card">{rows.length?<div className="table-wrap"><table><thead><tr><th>Deployment</th><th>Status</th><th>Commit</th><th>Image</th><th>Queued</th></tr></thead><tbody>{rows.map(d=><tr key={d.id}><td><Link className="repo-link row-title" href={"/projects/"+d.project_id}>{d.project_name}</Link><div className="row-sub">#{d.id}</div></td><td><StatusPill status={d.status}/>{d.error&&<div className="row-sub">{d.error.slice(0,100)}</div>}</td><td><code>{d.commit_sha?.slice(0,10)??"pending"}</code></td><td><div className="row-sub">{d.image?.split("/").pop()??"not built"}</div></td><td>{formatDate(d.queued_at)}</td></tr>)}</tbody></table></div>:<div className="empty">No deployments yet.</div>}</section>
  </>;
}
