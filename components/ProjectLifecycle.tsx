"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProjectLifecycle({projectId,archived=false}:{projectId:number;archived?:boolean}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function change(){
    const action=archived?"unarchive":"archive";
    if(!archived && !window.confirm("Archive this project? Auto-deploy will be disabled. Repositories, databases, volumes and deployment history will be kept.")) return;
    setBusy(true);
    setError("");
    try{
      const response=await fetch("/api/projects/"+projectId+"/lifecycle",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({action})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.error||"Lifecycle change failed");
      router.push(archived?"/projects":"/projects/archived");
      router.refresh();
    }catch(error){
      setError(error instanceof Error?error.message:"Lifecycle change failed");
      setBusy(false);
    }
  }

  return <div className="action-inline">
    <button className={archived?"secondary-button":"danger-button"} disabled={busy} onClick={change}>
      {busy?"Working…":archived?"Restore project":"Archive project"}
    </button>
    {error&&<span className="form-error">{error}</span>}
  </div>;
}
