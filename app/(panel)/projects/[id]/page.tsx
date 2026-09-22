import { notFound } from "next/navigation";
import { DeployButton, ProvisionDatabaseButton, RollbackButton, SecretForm } from "@/components/Forms";
import { StatusPill } from "@/components/StatusPill";
import { RuntimePanel } from "@/components/RuntimePanel";
import { VolumeForm } from "@/components/VolumeForm";
import { ObjectStorageButton } from "@/components/ObjectStorageButton";
import { PreviewDeployForm } from "@/components/PreviewDeployForm";
import { ProjectLifecycle } from "@/components/ProjectLifecycle";
import { CancelDeploymentButton } from "@/components/CancelDeploymentButton";
import { ProjectSettingsForm } from "@/components/ProjectSettingsForm";
import { RotateDatabaseButton } from "@/components/RotateDatabaseButton";
import { TeardownPreviewButton } from "@/components/TeardownPreviewButton";
import { one, query } from "@/lib/db";
import { formatDate } from "@/lib/utils";

type Project={id:number;name:string;slug:string;repo_full_name:string;repo_url:string;branch:string;staging_domain:string|null;staging_branch:string|null;dockerfile:string;domain:string;container_port:number;health_path:string;auto_deploy:boolean;server_id:number;server_name:string|null;server_status:string|null};
type Env={id:number;key:string;secret:boolean;environment:string;updated_at:string};
type Deployment={id:number;status:string;environment:string;target_branch:string|null;target_domain:string|null;commit_sha:string|null;image:string|null;error:string|null;queued_at:string;finished_at:string|null};
type Log={message:string;level:string;created_at:string};
type ManagedDb={name:string;username:string;host:string;port:number;created_at:string};
type Volume={id:number;name:string;mount_path:string;created_at:string};
type Bucket={bucket_name:string;endpoint:string;created_at:string};
type HealthCheck={environment:string;domain:string;status:string;http_status:number|null;latency_ms:number|null;error:string|null;checked_at:string};

export default async function ProjectPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const project=await one<Project>(`SELECT p.*,s.name server_name,s.status server_status FROM projects p LEFT JOIN servers s ON s.id=p.server_id WHERE p.id=$1`,[Number(id)]);
  if(!project) notFound();
  const [envs,deployments,managedDb,volumes,bucket,servers,healthChecks]=await Promise.all([
    query<Env>("SELECT id,key,secret,environment,updated_at FROM project_env WHERE project_id=$1 ORDER BY environment,key",[project.id]),
    query<Deployment>("SELECT id,status,environment,target_branch,target_domain,commit_sha,image,error,queued_at,finished_at FROM deployments WHERE project_id=$1 ORDER BY id DESC LIMIT 20",[project.id]),
    one<ManagedDb>("SELECT name,username,host,port,created_at FROM project_databases WHERE project_id=$1",[project.id]),
    query<Volume>("SELECT id,name,mount_path,created_at FROM project_volumes WHERE project_id=$1 ORDER BY name",[project.id]),
    one<Bucket>("SELECT bucket_name,endpoint,created_at FROM project_buckets WHERE project_id=$1",[project.id]),
    query<{id:number;name:string}>("SELECT id,name FROM servers ORDER BY name"),
    query<HealthCheck>("SELECT DISTINCT ON(environment) environment,domain,status,http_status,latency_ms,error,checked_at FROM project_health_checks WHERE project_id=$1 ORDER BY environment,checked_at DESC",[project.id])
  ]);
  const latest=deployments[0];
  const logs=latest?await query<Log>("SELECT message,level,created_at FROM deployment_logs WHERE deployment_id=$1 ORDER BY id DESC LIMIT 120",[latest.id]):[];
  return <>
    <header className="page-header"><div><div className="eyebrow">PROJECT · {project.slug.toUpperCase()}</div><h1>{project.name}</h1><p>{project.repo_full_name} → {project.domain}</p></div><div className="action-inline"><DeployButton projectId={project.id}/>{project.staging_domain?<DeployButton projectId={project.id} environment="staging"/>:null}</div></header>
    <section className="grid stats-grid">
      <div className="card stat-card"><div className="label">Production</div><div className="value" style={{fontSize:18}}>{project.domain}</div><div className="sub">HTTPS via Traefik + Let's Encrypt</div></div>
      <div className="card stat-card"><div className="label">Latest build</div><div className="value" style={{fontSize:20}}>{latest?<StatusPill status={latest.status}/>:<StatusPill status="UNKNOWN"/>}</div><div className="sub">{latest?formatDate(latest.queued_at):"Never deployed"}</div></div>
      <div className="card stat-card"><div className="label">Server</div><div className="value" style={{fontSize:18}}>{project.server_name??"Unassigned"}</div><div className="sub">{project.server_status??"UNKNOWN"}</div></div>
      <div className="card stat-card"><div className="label">Runtime</div><div className="value" style={{fontSize:18}}>:{project.container_port}</div><div className="sub">{project.health_path} health check{project.staging_domain?" · staging ready":""}</div></div>
    </section>
    <section className="grid two-col">
      <div className="card">
        <div className="card-header"><h2>Deployments</h2><span className="muted tiny">{project.branch} · {project.dockerfile}</span></div>
        {deployments.length?<div className="table-wrap"><table><thead><tr><th>ID</th><th>Target</th><th>Status</th><th>Commit</th><th>Queued</th><th></th></tr></thead><tbody>{deployments.map(d=><tr key={d.id}><td>#{d.id}</td><td><div className="row-title">{d.environment}</div><div className="row-sub">{d.target_branch||project.branch} · {d.target_domain||project.domain}</div></td><td><StatusPill status={d.status}/>{d.error&&<div className="row-sub">{d.error.slice(0,90)}</div>}</td><td><code>{d.commit_sha?.slice(0,10)??"pending"}</code></td><td>{formatDate(d.queued_at)}</td><td>{d.status==="QUEUED"?<CancelDeploymentButton deploymentId={d.id}/>:d.environment==="preview"&&d.status!=="REMOVED"?<TeardownPreviewButton deploymentId={d.id}/>:d.image&&d.id!==latest?.id?<RollbackButton deploymentId={d.id}/>:null}</td></tr>)}</tbody></table></div>:<div className="empty">No deployments yet.</div>}
      </div>
      <div className="card">
        <div className="card-header"><h2>Environment</h2><span className="muted tiny">AES-256-GCM encrypted</span></div>
        <div className="card-body stack">{managedDb?<div className="stack"><div className="kv"><span>Managed PostgreSQL</span><strong>{managedDb.name} · {managedDb.username}@{managedDb.host}:{managedDb.port}</strong></div><RotateDatabaseButton projectId={project.id}/></div>:<ProvisionDatabaseButton projectId={project.id}/>}<SecretForm projectId={project.id}/>{envs.map(e=><div className="row-between" key={e.id}><div><strong className="small">{e.key}</strong><div className="row-sub">{e.environment} · Updated {formatDate(e.updated_at)}</div></div><code>{e.secret?"••••••••":"stored"}</code></div>)}{!envs.length&&<div className="muted small">No environment variables stored.</div>}</div>
      </div>
    </section>
    <section className="card section-gap">
      <div className="card-header"><h2>External health</h2><span className="muted tiny">HTTPS checks every minute</span></div>
      <div className="card-body stack">
        {healthChecks.length?healthChecks.map(h=><div className="row-between" key={h.environment}><div><strong className="small">{h.environment} · {h.domain}</strong><div className="row-sub">{h.http_status?"HTTP "+h.http_status+" · ":""}{h.latency_ms!=null?h.latency_ms+" ms · ":""}checked {formatDate(h.checked_at)}{h.error?" · "+h.error:""}</div></div><StatusPill status={h.status}/></div>):<div className="muted small">No external health check has run yet. Checks start automatically after the worker comes online.</div>}
      </div>
    </section>
    <section className="card section-gap">
      <div className="card-header"><h2>Branch previews</h2><span className="muted tiny">{process.env.PREVIEW_BASE_DOMAIN||"Configure PREVIEW_BASE_DOMAIN"}</span></div>
      <div className="card-body"><PreviewDeployForm projectId={project.id}/></div>
    </section>
    <section className="card section-gap">
      <div className="card-header"><h2>Persistent storage</h2><span className="muted tiny">Survives container replacements</span></div>
      <div className="card-body stack">
        <div className="row-between"><div><strong className="small">S3-compatible object storage</strong><div className="row-sub">{bucket?bucket.bucket_name+" · "+bucket.endpoint:"Dedicated bucket and scoped credentials"}</div></div>{bucket?<StatusPill status="HEALTHY"/>:<ObjectStorageButton projectId={project.id}/>}</div>
        <VolumeForm projectId={project.id}/>
        {volumes.length?<div className="table-wrap"><table><thead><tr><th>Volume</th><th>Container path</th><th>Created</th></tr></thead><tbody>{volumes.map(v=><tr key={v.id}><td><code>{v.name}</code></td><td><code>{v.mount_path}</code></td><td>{formatDate(v.created_at)}</td></tr>)}</tbody></table></div>:<div className="muted small">No persistent volumes configured. Database-backed apps may not need one unless they also store local uploads or generated files.</div>}
      </div>
    </section>
    <section className="grid two-col section-gap">
      <div className="card">
        <div className="card-header"><h2>Latest deployment log</h2>{latest&&<span className="muted tiny">#{latest.id}</span>}</div>
        <div className="card-body"><div className="log">{logs.length?logs.reverse().map(l=>`[${l.level}] ${l.message}`).join("\n"):"No deployment log yet."}</div></div>
      </div>
      <div className="card">
        <div className="card-header"><h2>Runtime</h2><span className="muted tiny">Live from deployment agent</span></div>
        <div className="card-body"><RuntimePanel projectId={project.id}/></div>
      </div>
    </section>
    <section className="card section-gap">
      <div className="card-header"><h2>Deployment settings</h2><span className="muted tiny">Domains, branches, runtime and auto-deploy</span></div>
      <div className="card-body"><ProjectSettingsForm project={{
        id:project.id,
        repoFullName:project.repo_full_name,
        repoUrl:project.repo_url,
        domain:project.domain,
        branch:project.branch,
        stagingDomain:project.staging_domain||"",
        stagingBranch:project.staging_branch||"staging",
        dockerfile:project.dockerfile,
        containerPort:project.container_port,
        healthPath:project.health_path,
        serverId:project.server_id,
        autoDeploy:project.auto_deploy
      }} servers={servers}/></div>
    </section>
    <section className="card section-gap">
      <div className="card-header"><h2>Project lifecycle</h2><span className="muted tiny">Non-destructive</span></div>
      <div className="card-body row-between"><div><strong className="small">Archive this project</strong><div className="row-sub">Disables auto-deploy and hides the project while keeping repositories, data, volumes, images and history.</div></div><ProjectLifecycle projectId={project.id}/></div>
    </section>
  </>;
}
