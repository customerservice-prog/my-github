import { CreateRepositoryForm } from "@/components/Forms";
import { listRepositories } from "@/lib/forgejo";

export const dynamic="force-dynamic";

export default async function RepositoriesPage(){
  let repos:Awaited<ReturnType<typeof listRepositories>>=[];
  let error="";
  try{repos=await listRepositories();}catch(e){error=e instanceof Error?e.message:"Forgejo unavailable";}
  return <>
    <header className="page-header"><div><div className="eyebrow">SOURCE CONTROL</div><h1>Repositories</h1><p>Create private Git repositories or migrate existing GitHub projects into the server you control.</p></div><a className="secondary-button" href={process.env.FORGEJO_PUBLIC_URL||"#"} target="_blank" rel="noreferrer">Open Forgejo ↗</a></header>
    <CreateRepositoryForm/>
    {error&&<div className="notice section-gap">Forgejo API is not ready: {error}</div>}
    <section className="card section-gap">
      <div className="card-header"><h2>Your repositories</h2><span className="muted tiny">{repos.length} total</span></div>
      {repos.length?<div className="table-wrap"><table><thead><tr><th>Repository</th><th>Visibility</th><th>Clone</th></tr></thead><tbody>{repos.map(r=><tr key={r.id}><td><a className="repo-link row-title" href={r.html_url} target="_blank" rel="noreferrer">{r.full_name}</a><div className="row-sub">{r.description||"No description"}</div></td><td>{r.private?"Private":"Public"}</td><td><code>{r.clone_url}</code></td></tr>)}</tbody></table></div>:<div className="empty">No repositories returned by Forgejo.</div>}
    </section>
  </>;
}
