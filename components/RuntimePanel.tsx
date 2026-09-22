"use client";

import { useState } from "react";

type RuntimeData={
  status?:{status?:string;container?:string;maintenance?:boolean;startedAt?:string;restartCount?:number};
  logs?:string;
  container?:string|null;
};

export function RuntimePanel({projectId}:{projectId:number}){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [data,setData]=useState<RuntimeData|null>(null);

  async function refresh(){
    setBusy(true);
    setError("");
    try{
      const response=await fetch("/api/projects/"+projectId+"/runtime?lines=250",{cache:"no-store"});
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.error||"Runtime unavailable");
      setData(result);
    }catch(error){
      setError(error instanceof Error?error.message:"Runtime unavailable");
    }finally{
      setBusy(false);
    }
  }

  async function maintenance(enabled:boolean){
    setBusy(true);
    setError("");
    try{
      const response=await fetch("/api/projects/"+projectId+"/runtime",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({action:"maintenance",enabled})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.error||"Maintenance change failed");
      await refresh();
    }catch(error){
      setError(error instanceof Error?error.message:"Maintenance change failed");
      setBusy(false);
    }
  }

  async function restart(){
    setBusy(true);
    setError("");
    try{
      const response=await fetch("/api/projects/"+projectId+"/runtime",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({action:"restart"})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.error||"Restart failed");
      await refresh();
    }catch(error){
      setError(error instanceof Error?error.message:"Restart failed");
      setBusy(false);
    }
  }

  return <div className="stack">
    <div className="row-between">
      <div>
        <strong className="small">Application runtime</strong>
        <div className="row-sub">{data?.status?.status||"Not loaded"}{data?.container?" · "+data.container:""}</div>
      </div>
      <div className="action-inline">
        <button className="ghost-button" disabled={busy} onClick={refresh}>{busy?"Checking…":"Refresh"}</button>
        <button className="secondary-button" disabled={busy||data?.status?.status!=="RUNNING"} onClick={restart}>Restart</button>
        <button className={data?.status?.maintenance?"primary-button":"ghost-button"} disabled={busy||data?.status?.status!=="RUNNING"} onClick={()=>maintenance(!data?.status?.maintenance)}>{data?.status?.maintenance?"Restore traffic":"Maintenance"}</button>
      </div>
    </div>
    {data?.status?.startedAt&&<div className="tiny muted">Started {new Date(data.status.startedAt).toLocaleString()} · restarts {data.status.restartCount??0}{data.status.maintenance?" · maintenance active":""}</div>}
    {error&&<div className="form-error">{error}</div>}
    <div className="log">{data?.logs||"Load runtime status to view recent application logs."}</div>
  </div>;
}
