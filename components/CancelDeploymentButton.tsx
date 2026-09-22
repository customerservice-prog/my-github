"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CancelDeploymentButton({deploymentId}:{deploymentId:number}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function cancel(){
    setBusy(true); setError("");
    try{
      const response=await fetch("/api/deployments/"+deploymentId+"/cancel",{method:"POST"});
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.error||"Could not cancel deployment");
      router.refresh();
    }catch(error){
      setError(error instanceof Error?error.message:"Could not cancel deployment");
    }finally{
      setBusy(false);
    }
  }

  return <div className="action-inline">
    <button className="ghost-button" disabled={busy} onClick={cancel}>{busy?"Canceling…":"Cancel"}</button>
    {error&&<span className="form-error">{error}</span>}
  </div>;
}
