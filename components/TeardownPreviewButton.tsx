"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TeardownPreviewButton({deploymentId}:{deploymentId:number}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function teardown(){
    if(!window.confirm("Tear down this preview? Its preview container, route, and preview-only volumes will be removed.")) return;
    setBusy(true); setError("");
    try{
      const response=await fetch("/api/deployments/"+deploymentId+"/teardown",{method:"POST"});
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.error||"Preview teardown failed");
      router.refresh();
    }catch(error){
      setError(error instanceof Error?error.message:"Preview teardown failed");
    }finally{setBusy(false);}
  }

  return <div className="action-inline">
    <button className="danger-button" disabled={busy} onClick={teardown}>{busy?"Removing…":"Tear down preview"}</button>
    {error&&<span className="form-error">{error}</span>}
  </div>;
}
