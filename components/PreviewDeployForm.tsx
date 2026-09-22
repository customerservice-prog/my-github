"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PreviewDeployForm({projectId}:{projectId:number}){
  const router=useRouter();
  const [branch,setBranch]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [url,setUrl]=useState("");

  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    setBusy(true);
    setError("");
    setUrl("");
    try{
      const response=await fetch("/api/projects/"+projectId+"/deploy",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({environment:"preview",branch})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.error||"Could not queue preview");
      setUrl(result.domain?"https://"+result.domain:"");
      router.refresh();
    }catch(error){
      setError(error instanceof Error?error.message:"Could not queue preview");
    }finally{
      setBusy(false);
    }
  }

  return <form className="stack" onSubmit={submit}>
    <div className="inline-form">
      <input value={branch} onChange={e=>setBranch(e.target.value)} placeholder="feature/new-checkout" required/>
      <button className="secondary-button" disabled={busy}>{busy?"Queueing…":"Deploy preview"}</button>
    </div>
    {url&&<a className="repo-link small" href={url} target="_blank" rel="noreferrer">{url} ↗</a>}
    {error&&<div className="form-error">{error}</div>}
  </form>;
}
