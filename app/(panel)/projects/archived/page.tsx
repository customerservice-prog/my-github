import { ProjectLifecycle } from "@/components/ProjectLifecycle";
import { query } from "@/lib/db";
import { formatDate } from "@/lib/utils";

type Project={id:number;name:string;repo_full_name:string;domain:string;archived_at:string};

export default async function ArchivedProjectsPage(){
  const rows=await query<Project>(
    "SELECT id,name,repo_full_name,domain,archived_at FROM projects WHERE archived_at IS NOT NULL ORDER BY archived_at DESC"
  );
  return <>
    <header className="page-header">
      <div><div className="eyebrow">RECOVERABLE PROJECTS</div><h1>Archived projects</h1><p>Archiving never removes repositories, databases, storage or deployment history.</p></div>
    </header>
    <section className="card">
      {rows.length?<div className="table-wrap"><table><thead><tr><th>Project</th><th>Domain</th><th>Archived</th><th></th></tr></thead><tbody>
        {rows.map(p=><tr key={p.id}><td><div className="row-title">{p.name}</div><div className="row-sub">{p.repo_full_name}</div></td><td>{p.domain}</td><td>{formatDate(p.archived_at)}</td><td><ProjectLifecycle projectId={p.id} archived/></td></tr>)}
      </tbody></table></div>:<div className="empty">No archived projects.</div>}
    </section>
  </>;
}
