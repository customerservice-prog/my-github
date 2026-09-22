"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ServerDrainButton({serverId,draining}:{serverId:number;draining:boolean}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function toggle(){
    const next=!draining;
    if(next && !window.confirm("Drain this server? Existing applications stay online, but new manual, automatic, staging, preview, and queued deployments will not start on this node.")) return;
    setBusy(true); setError("");
    try{
      const response=await fetch("/api/servers/"+serverId,{
        method:"PATCH",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({draining:next})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.error||"Could not change server state");
      router.refresh();
    }catch(error){
      setError(error instanceof Error?error.message:"Could not change server state");
    }finally{
      setBusy(false);
    }
  }

  return <div className="action-inline">
    <button className={draining?"primary-button":"ghost-button"} disabled={busy} onClick={toggle}>
      {busy?"Working…":draining?"Resume deployments":"Drain"}
    </button>
    {error&&<span className="form-error">{error}</span>}
  </div>;
}
