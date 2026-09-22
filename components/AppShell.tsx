import Link from "next/link";
import type { ReactNode } from "react";
import type { SessionUser } from "@/lib/auth";

const nav = [
  ["/", "Overview", "⌂", ["OWNER","ADMIN","DEVELOPER","VIEWER"]],
  ["/projects", "Projects", "◫", ["OWNER","ADMIN","DEVELOPER","VIEWER"]],
  ["/repositories", "Repositories", "⌘", ["OWNER","ADMIN","DEVELOPER","VIEWER"]],
  ["/deployments", "Deployments", "↗", ["OWNER","ADMIN","DEVELOPER","VIEWER"]],
  ["/servers", "Servers", "▣", ["OWNER","ADMIN"]],
  ["/backups", "Backups", "⟳", ["OWNER","ADMIN"]],
  ["/audit", "Audit", "≡", ["OWNER","ADMIN"]],
  ["/settings", "Settings", "⚙", ["OWNER","ADMIN"]],
  ["/settings/users", "Users", "◎", ["OWNER"]]
] as const;

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">MG</div>
          <div><strong>My GitHub</strong><span>Private Dev Cloud</span></div>
        </div>
        <nav>
          {nav.filter(([, , ,roles])=>roles.includes(user.role as typeof roles[number])).map(([href,label,icon]) => (
            <Link href={href} key={href} className="nav-link"><span>{icon}</span>{label}</Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-chip"><div className="avatar">{user.email.slice(0,1).toUpperCase()}</div><div><strong>{user.email}</strong><span>{user.role}</span></div></div>
          <form action="/api/auth/logout" method="post"><button className="ghost-button full" type="submit">Sign out</button></form>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
