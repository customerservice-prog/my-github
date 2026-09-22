"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ObjectStorageButton({projectId}:{projectId:number}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function provision(){
    setBusy(true);
    setError("");
    try{
      const response=await fetch("/api/projects/"+projectId+"/bucket",{method:"POST"});
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.error||"Could not provision object storage");
      router.refresh();
    }catch(error){
      setError(error instanceof Error?error.message:"Could not provision object storage");
    }finally{
      setBusy(false);
    }
  }

  return <div className="action-inline">
    <button className="secondary-button" disabled={busy} onClick={provision}>{busy?"Provisioning…":"Provision object storage"}</button>
    {error&&<span className="form-error">{error}</span>}
  </div>;
}
