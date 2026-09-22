import Link from "next/link";
import type { ReactNode } from "react";
import type { SessionUser } from "@/lib/auth";

const nav = [
  ["/", "Overview", "⌂"],
  ["/projects", "Projects", "◫"],
  ["/repositories", "Repositories", "⌘"],
  ["/deployments", "Deployments", "↗"],
  ["/servers", "Servers", "▣"],
  ["/backups", "Backups", "⟳"],
  ["/audit", "Audit", "≡"],
  ["/settings", "Settings", "⚙"]
];

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">MG</div>
          <div><strong>My GitHub</strong><span>Private Dev Cloud</span></div>
        </div>
        <nav>
          {nav.map(([href,label,icon]) => (
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
