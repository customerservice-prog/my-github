"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ProjectSettings={
  id:number;
  repoFullName:string;
  repoUrl:string;
  domain:string;
  branch:string;
  stagingDomain:string;
  stagingBranch:string;
  dockerfile:string;
  containerPort:number;
  healthPath:string;
  serverId:number;
  autoDeploy:boolean;
};

export function ProjectSettingsForm({project,servers}:{project:ProjectSettings;servers:{id:number;name:string}[]}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    setBusy(true); setError(""); setMessage("");
    try{
      const response=await fetch("/api/projects/"+project.id,{
        method:"PATCH",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({
          repoFullName:f.get("repoFullName"),
          repoUrl:f.get("repoUrl"),
          domain:f.get("domain"),
          branch:f.get("branch"),
          stagingDomain:f.get("stagingDomain")||"",
          stagingBranch:f.get("stagingBranch")||"staging",
          dockerfile:f.get("dockerfile"),
          containerPort:Number(f.get("containerPort")),
          healthPath:f.get("healthPath"),
          serverId:Number(f.get("serverId")),
          autoDeploy:f.get("autoDeploy")==="on"
        })
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.error||"Could not save project settings");
      setMessage(result.warning?"Saved, but webhook update needs attention: "+result.warning:"Saved.");
      router.refresh();
    }catch(error){
      setError(error instanceof Error?error.message:"Could not save project settings");
    }finally{setBusy(false);}
  }

  return <form className="stack" onSubmit={submit}>
    <div className="form-grid">
      <label>Repository<input name="repoFullName" defaultValue={project.repoFullName} required/></label>
      <label>Clone URL<input name="repoUrl" type="url" defaultValue={project.repoUrl} required/></label>
      <label>Production domain<input name="domain" defaultValue={project.domain} required/></label>
      <label>Production branch<input name="branch" defaultValue={project.branch} required/></label>
      <label>Staging domain<input name="stagingDomain" defaultValue={project.stagingDomain} placeholder="staging.example.com"/></label>
      <label>Staging branch<input name="stagingBranch" defaultValue={project.stagingBranch||"staging"} required/></label>
      <label>Dockerfile<input name="dockerfile" defaultValue={project.dockerfile} required/></label>
      <label>Container port<input name="containerPort" type="number" min="1" max="65535" defaultValue={project.containerPort} required/></label>
      <label>Health path<input name="healthPath" defaultValue={project.healthPath} required/></label>
      <label>Deployment server<select name="serverId" defaultValue={project.serverId} required>{servers.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
    </div>
    <label className="check"><input name="autoDeploy" type="checkbox" defaultChecked={project.autoDeploy}/>Auto-deploy production/staging pushes from Forgejo</label>
    <div className="action-inline"><button className="secondary-button" disabled={busy}>{busy?"Saving…":"Save deployment settings"}</button>{message&&<span className="small muted">{message}</span>}{error&&<span className="form-error">{error}</span>}</div>
  </form>;
}
