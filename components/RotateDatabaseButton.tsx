"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RotateDatabaseButton({projectId}:{projectId:number}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function rotate(){
    if(!window.confirm("Rotate this database password? The encrypted production DATABASE_URL will be updated immediately. Redeploy or restart the app afterward so it receives the new credential.")) return;
    setBusy(true); setError("");
    try{
      const response=await fetch("/api/projects/"+projectId+"/database",{method:"PATCH"});
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.error||"Could not rotate database password");
      router.refresh();
    }catch(error){
      setError(error instanceof Error?error.message:"Could not rotate database password");
    }finally{setBusy(false);}
  }

  return <div className="action-inline">
    <button className="ghost-button" disabled={busy} onClick={rotate}>{busy?"Rotating…":"Rotate DB password"}</button>
    {error&&<span className="form-error">{error}</span>}
  </div>;
}
