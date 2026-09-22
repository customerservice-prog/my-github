"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function post(body:unknown){
  const response=await fetch("/api/backups/restore",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify(body)
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(result.error||"Restore request failed");
  return result;
}

export function RestoreButton({backupId,kind}:{backupId:number;kind:"platform"|"forgejo"}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function restore(){
    setBusy(true); setError("");
    try{await post({action:"restore",backupId,kind});router.refresh();}
    catch(error){setError(error instanceof Error?error.message:"Restore request failed");}
    finally{setBusy(false);}
  }
  return <div className="action-inline">
    <button className="ghost-button" disabled={busy} onClick={restore}>{busy?"Queued…":"Test "+kind+" restore"}</button>
    {error&&<span className="form-error">{error}</span>}
  </div>;
}

export function CleanupRestoreButton({jobId}:{jobId:number}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function cleanup(){
    if(!window.confirm("Drop this temporary inspection database? The backup snapshot itself is not affected.")) return;
    setBusy(true); setError("");
    try{await post({action:"cleanup",jobId});router.refresh();}
    catch(error){setError(error instanceof Error?error.message:"Cleanup failed");}
    finally{setBusy(false);}
  }
  return <div className="action-inline">
    <button className="danger-button" disabled={busy} onClick={cleanup}>{busy?"Queued…":"Delete test restore"}</button>
    {error&&<span className="form-error">{error}</span>}
  </div>;
}
