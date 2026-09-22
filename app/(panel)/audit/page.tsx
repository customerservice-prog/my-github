import { query } from "@/lib/db";
import { formatDate } from "@/lib/utils";

type Audit={id:number;email:string|null;action:string;target_type:string;target_id:string|null;metadata:Record<string,unknown>;created_at:string};

export default async function AuditPage(){
  const rows=await query<Audit>("SELECT a.*,u.email FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 300");
  return <>
    <header className="page-header"><div><div className="eyebrow">SECURITY TRAIL</div><h1>Audit log</h1><p>High-impact actions are recorded here: authentication changes, repository actions, deployments, server registration, secrets and backups.</p></div></header>
    <section className="card">{rows.length?<div className="table-wrap"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>{rows.map(a=><tr key={a.id}><td>{formatDate(a.created_at)}</td><td>{a.email||"system"}</td><td><code>{a.action}</code></td><td>{a.target_type}{a.target_id?" #"+a.target_id:""}</td><td className="row-sub">{Object.keys(a.metadata||{}).length?JSON.stringify(a.metadata).slice(0,180):"—"}</td></tr>)}</tbody></table></div>:<div className="empty">No audit events yet.</div>}</section>
  </>;
}
