import { CreateServerForm } from "@/components/Forms";
import { StatusPill } from "@/components/StatusPill";
import { query } from "@/lib/db";
import { formatDate } from "@/lib/utils";

type Server={id:number;name:string;base_url:string;status:string;last_seen:string|null;created_at:string};

export default async function ServersPage(){
  const rows=await query<Server>("SELECT id,name,base_url,status,last_seen,created_at FROM servers ORDER BY id");
  return <>
    <header className="page-header"><div><div className="eyebrow">COMPUTE FLEET</div><h1>Servers</h1><p>Register deployment agents on this machine or remote Docker hosts. Agent ports should stay on private networking.</p></div></header>
    <section className="card inset"><CreateServerForm/></section>
    <section className="card section-gap">
      <div className="card-header"><h2>Deployment nodes</h2><span className="muted tiny">{rows.length} registered</span></div>
      {rows.length?<div className="table-wrap"><table><thead><tr><th>Server</th><th>Status</th><th>Agent</th><th>Last seen</th></tr></thead><tbody>{rows.map(s=><tr key={s.id}><td><div className="row-title">{s.name}</div><div className="row-sub">Added {formatDate(s.created_at)}</div></td><td><StatusPill status={s.status}/></td><td><code>{s.base_url}</code></td><td>{formatDate(s.last_seen)}</td></tr>)}</tbody></table></div>:<div className="empty">Register the local agent first, then add remote production nodes as needed.</div>}
    </section>
    <div className="notice section-gap">Remote agents intentionally do not expose databases. Keep the agent endpoint private using a VPN, private VLAN, Tailscale/WireGuard, or an equivalent protected network.</div>
  </>;
}
