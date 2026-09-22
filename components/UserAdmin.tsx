"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function jsonRequest(url:string,method:string,body:unknown){
  const response=await fetch(url,{
    method,
    headers:{"content-type":"application/json"},
    body:JSON.stringify(body)
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(result.error||"Request failed");
  return result;
}

export function CreateUserForm(){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    const form=e.currentTarget;
    const f=new FormData(form);
    setBusy(true);setError("");
    try{
      await jsonRequest("/api/users","POST",{email:f.get("email"),password:f.get("password"),role:f.get("role")});
      form.reset();
      router.refresh();
    }catch(error){
      setError(error instanceof Error?error.message:"Could not create user");
    }finally{setBusy(false);}
  }
  return <form className="inline-form" onSubmit={submit}>
    <input name="email" type="email" placeholder="developer@example.com" required/>
    <input name="password" type="password" placeholder="Temporary password (12+ chars)" minLength={12} required/>
    <select name="role" defaultValue="DEVELOPER">
      <option value="OWNER">Owner</option>
      <option value="ADMIN">Admin</option>
      <option value="DEVELOPER">Developer</option>
      <option value="VIEWER">Viewer</option>
    </select>
    <button className="primary-button" disabled={busy}>{busy?"Creating…":"Create user"}</button>
    {error&&<span className="form-error">{error}</span>}
  </form>;
}

export function UserAccessControl({user}:{user:{id:number;email:string;role:string;disabled:boolean}}){
  const router=useRouter();
  const [role,setRole]=useState(user.role);
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function update(body:Record<string,unknown>){
    setBusy(true);setError("");
    try{
      await jsonRequest("/api/users/"+user.id,"PATCH",body);
      setPassword("");
      router.refresh();
    }catch(error){
      setError(error instanceof Error?error.message:"Could not update user");
    }finally{setBusy(false);}
  }

  return <div className="stack">
    <div className="inline-form">
      <select value={role} onChange={e=>setRole(e.target.value)} disabled={busy}>
        <option value="OWNER">Owner</option>
        <option value="ADMIN">Admin</option>
        <option value="DEVELOPER">Developer</option>
        <option value="VIEWER">Viewer</option>
      </select>
      <button className="ghost-button" disabled={busy||role===user.role} onClick={()=>update({role})}>Save role</button>
      <button className={user.disabled?"primary-button":"danger-button"} disabled={busy} onClick={()=>update({disabled:!user.disabled})}>{user.disabled?"Enable":"Disable"}</button>
    </div>
    <div className="inline-form">
      <input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={12} placeholder="New password (12+ chars)"/>
      <button className="secondary-button" disabled={busy||password.length<12} onClick={()=>update({password})}>Rotate password</button>
    </div>
    {error&&<div className="form-error">{error}</div>}
  </div>;
}
