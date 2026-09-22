"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function request(url:string,method:string,body?:unknown){
  const response=await fetch(url,{
    method,
    headers:body?{"content-type":"application/json"}:undefined,
    body:body?JSON.stringify(body):undefined
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(result.error||"Request failed");
  return result;
}

export function CreateServiceForm({projectId}:{projectId:number}){
  const router=useRouter();
  const [type,setType]=useState<"worker"|"cron">("worker");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    const form=e.currentTarget;
    const f=new FormData(form);
    setBusy(true);setError("");
    try{
      await request("/api/projects/"+projectId+"/services","POST",{
        name:f.get("name"),
        type,
        command:f.get("command"),
        schedule:type==="cron"?f.get("schedule"):""
      });
      form.reset();
      router.refresh();
    }catch(error){
      setError(error instanceof Error?error.message:"Could not create service");
    }finally{setBusy(false);}
  }

  return <form className="stack card inset" onSubmit={submit}>
    <div className="segmented">
      <button type="button" className={type==="worker"?"active":""} onClick={()=>setType("worker")}>Long-running worker</button>
      <button type="button" className={type==="cron"?"active":""} onClick={()=>setType("cron")}>Scheduled cron</button>
    </div>
    <div className="form-grid">
      <label>Service name<input name="name" placeholder={type==="worker"?"email-worker":"nightly-cleanup"} required pattern="[a-z0-9][a-z0-9-]{0,40}"/></label>
      {type==="cron"?<label>Schedule (UTC)<input name="schedule" placeholder="0 4 * * *" required/></label>:<label>Lifecycle<span className="notice">Worker changes take effect on the next production deploy.</span></label>}
    </div>
    <label>Command<input name="command" placeholder={type==="worker"?"npm run worker":"npm run cleanup"} required/></label>
    <div className="row-sub">{type==="cron"?"Five-field cron format in UTC. Runs use the latest healthy production image.":"The worker restarts with every successful production deploy and shares production-scoped environment values."}</div>
    {error&&<div className="form-error">{error}</div>}
    <button className="secondary-button" disabled={busy}>{busy?"Saving…":"Add "+(type==="worker"?"worker":"cron job")}</button>
  </form>;
}

export function ServiceControl({projectId,serviceId,enabled}:{projectId:number;serviceId:number;enabled:boolean}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function patch(){
    setBusy(true);setError("");
    try{
      await request("/api/projects/"+projectId+"/services/"+serviceId,"PATCH",{enabled:!enabled});
      router.refresh();
    }catch(error){setError(error instanceof Error?error.message:"Could not update service");}
    finally{setBusy(false);}
  }

  async function remove(){
    if(!window.confirm("Delete this service definition? Recorded run history is also removed.")) return;
    setBusy(true);setError("");
    try{
      await request("/api/projects/"+projectId+"/services/"+serviceId,"DELETE");
      router.refresh();
    }catch(error){setError(error instanceof Error?error.message:"Could not delete service");}
    finally{setBusy(false);}
  }

  return <div className="action-inline">
    <button className={enabled?"ghost-button":"primary-button"} disabled={busy} onClick={patch}>{enabled?"Disable":"Enable"}</button>
    <button className="danger-button" disabled={busy} onClick={remove}>Delete</button>
    {error&&<span className="form-error">{error}</span>}
  </div>;
}
