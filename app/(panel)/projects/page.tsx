import Link from "next/link";
import { CreateProjectForm } from "@/components/Forms";
import { StatusPill } from "@/components/StatusPill";
import { query } from "@/lib/db";
import { formatDate } from "@/lib/utils";

type Project={id:number;name:string;slug:string;domain:string;repo_full_name:string;branch:string;created_at:string;latest_status:string|null;latest_at:string|null};
type Server={id:number;name:string};

export default async function ProjectsPage(){
  const [projects,servers]=await Promise.all([
    query<Project>(`SELECT p.*,d.status latest_status,d.queued_at latest_at
      FROM projects p LEFT JOIN LATERAL (SELECT status,queued_at FROM deployments WHERE project_id=p.id ORDER BY id DESC LIMIT 1) d ON true
      ORDER BY p.created_at DESC`),
    query<Server>("SELECT id,name FROM servers ORDER BY name")
  ]);
  return <>
    <header className="page-header"><div><div className="eyebrow">APPLICATIONS</div><h1>Projects</h1><p>Bind a repository to a server, domain, health check and automated deployment pipeline.</p></div><Link href="/projects/archived" className="ghost-button">Archived projects</Link></header>
    <CreateProjectForm servers={servers}/>
    <div className="section-gap project-grid">
      {projects.map(p=><Link href={"/projects/"+p.id} className="card project-card" key={p.id}>
        <div className="row-between"><div><h3>{p.name}</h3><p>{p.repo_full_name} · {p.branch}</p></div><StatusPill status={p.latest_status ?? "UNKNOWN"}/></div>
        <div className="kv-grid"><div className="kv"><span>Domain</span><strong>{p.domain}</strong></div><div className="kv"><span>Last deploy</span><strong>{p.latest_at?formatDate(p.latest_at):"Never"}</strong></div></div>
      </Link>)}
      {!projects.length&&<div className="card empty">No projects yet. The form above creates your first production workload.</div>}
    </div>
  </>;
}
