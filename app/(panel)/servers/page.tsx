import { CreateServerForm } from "@/components/Forms";
import { ServerDrainButton } from "@/components/ServerDrainButton";
import { StatusPill } from "@/components/StatusPill";
import { query } from "@/lib/db";
import { formatDate } from "@/lib/utils";

type Metrics={
  hostname?:string;
  docker?:string;
  uptimeSeconds?:number;
  loadAverage?:number[];
  memory?:{totalBytes?:number;freeBytes?:number;usedPercent?:number};
  disk?:{totalBytes?:number|null;freeBytes?:number|null};
};
type Server={
  id:number;
  name:string;
  base_url:string;
  status:string;
  draining:boolean;
  metrics:Metrics;
  last_seen:string|null;
  created_at:string;
};

function formatBytes(value:number|null|undefined){
  if(value==null||!Number.isFinite(value)) return "—";
  const units=["B","KB","MB","GB","TB"];
  let n=value,unit=0;
  while(n>=1024&&unit<units.length-1){n/=1024;unit++;}
  return n.toFixed(unit>=3?1:0)+" "+units[unit];
}

function diskUsed(metrics:Metrics){
  const total=metrics.disk?.totalBytes;
  const free=metrics.disk?.freeBytes;
  if(!total||free==null) return null;
  return Math.max(0,Math.min(100,Math.round((1-free/total)*1000)/10));
}

function uptime(seconds:number|undefined){
  if(!seconds) return "—";
  const days=Math.floor(seconds/86400);
  const hours=Math.floor((seconds%86400)/3600);
  return (days?days+"d ":"")+hours+"h";
}

export default async function ServersPage(){
  const rows=await query<Server>("SELECT id,name,base_url,status,draining,metrics,last_seen,created_at FROM servers ORDER BY id");
  return <>
    <header className="page-header">
      <div><div className="eyebrow">COMPUTE FLEET</div><h1>Servers</h1><p>Live health, resource telemetry, deployment controls, and private agent registration for every Docker node.</p></div>
    </header>
    <section className="card inset"><CreateServerForm/></section>
    <section className="card section-gap">
      <div className="card-header"><h2>Deployment nodes</h2><span className="muted tiny">{rows.length} registered</span></div>
      {rows.length?<div className="table-wrap"><table>
        <thead><tr><th>Server</th><th>Status</th><th>Resources</th><th>Agent</th><th>Last seen</th><th></th></tr></thead>
        <tbody>{rows.map(s=>{
          const disk=diskUsed(s.metrics||{});
          return <tr key={s.id}>
            <td><div className="row-title">{s.name}</div><div className="row-sub">{s.metrics?.hostname||"Agent"} · Docker {s.metrics?.docker||"—"} · uptime {uptime(s.metrics?.uptimeSeconds)}</div></td>
            <td><StatusPill status={s.draining?"DRAINING":s.status}/></td>
            <td>
              <div className="row-sub">Memory {s.metrics?.memory?.usedPercent??"—"}% · Disk {disk??"—"}%</div>
              <div className="row-sub">Load {s.metrics?.loadAverage?.slice(0,3).map(v=>v.toFixed(2)).join(" / ")||"—"} · RAM {formatBytes(s.metrics?.memory?.totalBytes)}</div>
            </td>
            <td><code>{s.base_url}</code></td>
            <td>{formatDate(s.last_seen)}</td>
            <td><ServerDrainButton serverId={s.id} draining={s.draining}/></td>
          </tr>;
        })}</tbody>
      </table></div>:<div className="empty">The bootstrap process registers Local Production automatically. Add remote private agents here when you expand the fleet.</div>}
    </section>
    <div className="notice section-gap">Drain mode never stops existing application containers. It only prevents new releases from being scheduled or claimed on that node. Agent port 7001 should remain private/VPN-only.</div>
  </>;
}
