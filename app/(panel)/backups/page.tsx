import { BackupButton } from "@/components/Forms";
import { StatusPill } from "@/components/StatusPill";
import { CleanupRestoreButton, RestoreButton } from "@/components/RestoreControls";
import { query } from "@/lib/db";
import { formatDate } from "@/lib/utils";

type Backup={id:number;kind:string;target:string;status:string;snapshot_id:string|null;location:string|null;size_bytes:number|null;error:string|null;created_at:string};
type RestoreJob={id:number;backup_id:number|null;snapshot_id:string;kind:string;status:string;database_name:string|null;error:string|null;created_at:string;finished_at:string|null};

export default async function BackupsPage(){
  const [rows,restores]=await Promise.all([query<Backup>("SELECT * FROM backups ORDER BY id DESC LIMIT 100"),query<RestoreJob>("SELECT id,backup_id,snapshot_id,kind,status,database_name,error,created_at,finished_at FROM restore_jobs ORDER BY id DESC LIMIT 100")]);
  return <>
    <header className="page-header"><div><div className="eyebrow">RECOVERY</div><h1>Backups</h1><p>PostgreSQL dumps, Forgejo data and object storage are captured by restic with retention pruning.</p></div><BackupButton/></header>
    <div className="notice">For real disaster recovery, point <code>RESTIC_REPOSITORY</code> at off-site S3-compatible storage. A backup stored only on the production machine is not disaster recovery.</div>
    <section className="card section-gap">
      <div className="card-header"><h2>Snapshot history</h2><span className="muted tiny">Daily 7 · weekly 5 · monthly 12</span></div>
      {rows.length?<div className="table-wrap"><table><thead><tr><th>Time</th><th>Status</th><th>Snapshot</th><th>Target</th><th>Restore drill</th><th>Error</th></tr></thead><tbody>{rows.map(b=><tr key={b.id}><td>{formatDate(b.created_at)}</td><td><StatusPill status={b.status}/></td><td><code>{b.snapshot_id||"—"}</code></td><td>{b.target}</td><td>{b.status==="SUCCESS"&&b.snapshot_id?<div className="action-inline"><RestoreButton backupId={b.id} kind="platform"/><RestoreButton backupId={b.id} kind="forgejo"/></div>:"—"}</td><td className="row-sub">{b.error||"—"}</td></tr>)}</tbody></table></div>:<div className="empty">No backup event has reported yet. The backup service runs once on first start and then on schedule.</div>}
    </section>
    <section className="card section-gap">
      <div className="card-header"><h2>Restore drills</h2><span className="muted tiny">Always isolated from live databases</span></div>
      {restores.length?<div className="table-wrap"><table><thead><tr><th>Requested</th><th>Kind</th><th>Status</th><th>Inspection database</th><th>Error</th><th></th></tr></thead><tbody>{restores.map(j=><tr key={j.id}><td>{formatDate(j.created_at)}</td><td>{j.kind}</td><td><StatusPill status={j.status}/></td><td><code>{j.database_name||"—"}</code></td><td className="row-sub">{j.error||"—"}</td><td>{j.status==="READY"?<CleanupRestoreButton jobId={j.id}/>:null}</td></tr>)}</tbody></table></div>:<div className="empty">No restore drill has been run yet. Test restores are created as separate temporary databases and never overwrite live data.</div>}
    </section>
  </>;
}
