import { BackupButton } from "@/components/Forms";
import { StatusPill } from "@/components/StatusPill";
import { query } from "@/lib/db";
import { formatDate } from "@/lib/utils";

type Backup={id:number;kind:string;target:string;status:string;snapshot_id:string|null;location:string|null;size_bytes:number|null;error:string|null;created_at:string};

export default async function BackupsPage(){
  const rows=await query<Backup>("SELECT * FROM backups ORDER BY id DESC LIMIT 100");
  return <>
    <header className="page-header"><div><div className="eyebrow">RECOVERY</div><h1>Backups</h1><p>PostgreSQL dumps, Forgejo data and object storage are captured by restic with retention pruning.</p></div><BackupButton/></header>
    <div className="notice">For real disaster recovery, point <code>RESTIC_REPOSITORY</code> at off-site S3-compatible storage. A backup stored only on the production machine is not disaster recovery.</div>
    <section className="card section-gap">
      <div className="card-header"><h2>Snapshot history</h2><span className="muted tiny">Daily 7 · weekly 5 · monthly 12</span></div>
      {rows.length?<div className="table-wrap"><table><thead><tr><th>Time</th><th>Status</th><th>Snapshot</th><th>Target</th><th>Error</th></tr></thead><tbody>{rows.map(b=><tr key={b.id}><td>{formatDate(b.created_at)}</td><td><StatusPill status={b.status}/></td><td><code>{b.snapshot_id||"—"}</code></td><td>{b.target}</td><td className="row-sub">{b.error||"—"}</td></tr>)}</tbody></table></div>:<div className="empty">No backup event has reported yet. The backup service runs once on first start and then on schedule.</div>}
    </section>
  </>;
}
