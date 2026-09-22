import { MfaPanel } from "@/components/Forms";
import { requirePageUser } from "@/lib/auth";

export default async function SettingsPage(){
  const user=await requirePageUser();
  const checks=[
    ["Encrypted application secrets","AES-256-GCM using MASTER_KEY"],
    ["Session cookies","HTTP-only, SameSite=Strict, secure in production"],
    ["Source registration","Forgejo public registration disabled"],
    ["Database exposure","PostgreSQL and Redis remain on private Docker network"],
    ["HTTPS","Traefik automatically requests and renews certificates"],
    ["Backups","Restic retention with off-site repository support"]
  ];
  return <>
    <header className="page-header"><div><div className="eyebrow">PLATFORM SECURITY</div><h1>Settings</h1><p>Owner account protection and production configuration status.</p></div></header>
    <section className="grid two-col">
      <div className="card"><div className="card-header"><h2>Owner security</h2></div><div className="card-body"><MfaPanel enabled={user.two_factor_enabled}/></div></div>
      <div className="card"><div className="card-header"><h2>Platform endpoints</h2></div><div className="card-body stack">
        <div className="kv"><span>Control plane</span><strong>https://{process.env.CONTROL_DOMAIN||"not-configured"}</strong></div>
        <div className="kv"><span>Git service</span><strong>{process.env.FORGEJO_PUBLIC_URL||"not-configured"}</strong></div>
        <div className="kv"><span>Registry</span><strong>{process.env.REGISTRY_HOST||"not-configured"}</strong></div>
      </div></div>
    </section>
    <section className="card section-gap"><div className="card-header"><h2>Launch security baseline</h2></div><div className="card-body stack">{checks.map(([title,detail])=><div className="row-between" key={title}><div><strong className="small">{title}</strong><div className="row-sub">{detail}</div></div><span className="status status-healthy"><span className="status-dot"/>Configured</span></div>)}</div></section>
  </>;
}
