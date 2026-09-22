"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function VolumeForm({projectId}:{projectId:number}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    const form=e.currentTarget;
    const data=new FormData(form);
    setBusy(true);
    setError("");
    try{
      const response=await fetch("/api/projects/"+projectId+"/volumes",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({name:data.get("name"),mountPath:data.get("mountPath")})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(result.error||"Could not create volume");
      form.reset();
      router.refresh();
    }catch(error){
      setError(error instanceof Error?error.message:"Could not create volume");
    }finally{
      setBusy(false);
    }
  }

  return <form className="inline-form" onSubmit={submit}>
    <input name="name" placeholder="uploads" required pattern="[a-z0-9][a-z0-9-]{0,40}"/>
    <input name="mountPath" placeholder="/app/uploads" required/>
    <button className="secondary-button" disabled={busy}>{busy?"Saving…":"Add volume"}</button>
    {error&&<span className="form-error">{error}</span>}
  </form>;
}
