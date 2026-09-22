import { CreateUserForm, UserAccessControl } from "@/components/UserAdmin";
import { StatusPill } from "@/components/StatusPill";
import { requirePageUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { redirect } from "next/navigation";

type User={
  id:number;
  email:string;
  role:string;
  disabled:boolean;
  two_factor_enabled:boolean;
  last_login_at:string|null;
  created_at:string;
};

export default async function UsersPage(){
  const actor=await requirePageUser();
  if(actor.role!=="OWNER") redirect("/");
  const users=await query<User>("SELECT id,email,role,disabled,two_factor_enabled,last_login_at,created_at FROM users ORDER BY created_at");
  return <>
    <header className="page-header">
      <div><div className="eyebrow">ACCESS CONTROL</div><h1>Users</h1><p>Owner-managed access for administrators, developers and read-only viewers.</p></div>
    </header>
    <section className="card inset"><CreateUserForm/></section>
    <section className="card section-gap">
      <div className="card-header"><h2>Platform users</h2><span className="muted tiny">{users.length} account(s)</span></div>
      <div className="card-body stack">
        {users.map(user=><div className="card inset" key={user.id}>
          <div className="row-between">
            <div>
              <strong>{user.email}</strong>
              <div className="row-sub">{user.role} · created {formatDate(user.created_at)} · last login {formatDate(user.last_login_at)}</div>
            </div>
            <div className="action-inline">
              <StatusPill status={user.disabled?"DISABLED":"HEALTHY"}/>
              <StatusPill status={user.two_factor_enabled?"MFA ON":"MFA OFF"}/>
            </div>
          </div>
          <div className="section-gap"><UserAccessControl user={{id:user.id,email:user.email,role:user.role,disabled:user.disabled}}/></div>
        </div>)}
      </div>
    </section>
    <div className="notice section-gap">Role model: Owner has full platform and user administration; Admin has infrastructure/project control but cannot manage Owners; Developer can work with repositories/projects/deployments; Viewer is read-only on application/project surfaces.</div>
  </>;
}
