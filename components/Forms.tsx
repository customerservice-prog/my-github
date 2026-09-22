"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function send(url: string, body: unknown, method = "POST") {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError("");
    try {
      const result = await fn();
      router.refresh();
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      throw e;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

export function LoginForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await send("/api/auth/login", { email: f.get("email"), password: f.get("password"), otp: f.get("otp") });
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      setBusy(false);
    }
  }
  return <form onSubmit={submit} className="stack">
    <label>Email<input name="email" type="email" autoComplete="email" required /></label>
    <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
    <label>Authenticator code <span className="muted">(only if enabled)</span><input name="otp" inputMode="numeric" autoComplete="one-time-code" /></label>
    {error && <div className="form-error">{error}</div>}
    <button className="primary-button" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
  </form>;
}

export function CreateServerForm() {
  const a = useAction();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      await a.run(() => send("/api/servers", { name: f.get("name"), baseUrl: f.get("baseUrl"), token: f.get("token") }));
      form.reset();
    } catch {}
  }
  return <form onSubmit={submit} className="inline-form">
    <input name="name" placeholder="Production 01" required />
    <input name="baseUrl" placeholder="https://agent.internal:7001" required />
    <input name="token" type="password" placeholder="Agent token" required />
    <button className="primary-button" disabled={a.busy}>Add server</button>
    {a.error && <span className="form-error">{a.error}</span>}
  </form>;
}

export function CreateRepositoryForm() {
  const a = useAction();
  const [mode, setMode] = useState("create");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      await a.run(() => send("/api/repositories", {
        mode,
        name: f.get("name"),
        description: f.get("description"),
        cloneUrl: f.get("cloneUrl"),
        private: true
      }));
      form.reset();
    } catch {}
  }
  return <form onSubmit={submit} className="stack card inset">
    <div className="segmented">
      <button type="button" className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>New repository</button>
      <button type="button" className={mode === "import" ? "active" : ""} onClick={() => setMode("import")}>Import GitHub/Git</button>
    </div>
    <div className="form-grid">
      <label>Repository name<input name="name" placeholder="my-project" required /></label>
      <label>Description<input name="description" placeholder="What this project does" /></label>
    </div>
    {mode === "import" && <label>Clone URL<input name="cloneUrl" type="url" placeholder="https://github.com/owner/repo.git" required /></label>}
    {a.error && <div className="form-error">{a.error}</div>}
    <button className="primary-button" disabled={a.busy}>{a.busy ? "Working…" : mode === "create" ? "Create repository" : "Import repository"}</button>
  </form>;
}

export type ServerOption = { id: number; name: string };

export function CreateProjectForm({ servers }: { servers: ServerOption[] }) {
  const a = useAction();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      await a.run(() => send("/api/projects", {
        name: f.get("name"),
        repoFullName: f.get("repoFullName"),
        repoUrl: f.get("repoUrl"),
        domain: f.get("domain"),
        branch: f.get("branch") || "main",
        stagingDomain: f.get("stagingDomain") || "",
        stagingBranch: f.get("stagingBranch") || "staging",
        dockerfile: f.get("dockerfile") || "Dockerfile",
        containerPort: Number(f.get("containerPort") || 3000),
        healthPath: f.get("healthPath") || "/api/health",
        serverId: Number(f.get("serverId"))
      }));
      form.reset();
    } catch {}
  }
  return <form onSubmit={submit} className="stack card inset">
    <div className="form-grid">
      <label>Project name<input name="name" placeholder="RentSketch" required /></label>
      <label>Forgejo repository<input name="repoFullName" placeholder="admin/rentsketch" required /></label>
      <label>Clone URL<input name="repoUrl" type="url" placeholder="https://git.example.com/admin/rentsketch.git" required /></label>
      <label>Production domain<input name="domain" placeholder="rentsketch.com" required /></label>
      <label>Production branch<input name="branch" defaultValue="main" required /></label>
      <label>Staging domain <span className="muted">(optional)</span><input name="stagingDomain" placeholder="staging.rentsketch.com" /></label>
      <label>Staging branch<input name="stagingBranch" defaultValue="staging" required /></label>
      <label>Dockerfile<input name="dockerfile" defaultValue="Dockerfile" required /></label>
      <label>Container port<input name="containerPort" type="number" defaultValue="3000" min="1" max="65535" required /></label>
      <label>Health path<input name="healthPath" defaultValue="/api/health" required /></label>
      <label>Deployment server<select name="serverId" required defaultValue=""><option value="" disabled>Select server</option>{servers.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
    </div>
    {a.error && <div className="form-error">{a.error}</div>}
    <button className="primary-button" disabled={a.busy}>Create project</button>
  </form>;
}

export function DeployButton({ projectId, environment = "production" }: { projectId: number; environment?: "production" | "staging" }) {
  const a = useAction();
  const label=environment==="staging"?"Deploy staging":"Deploy production";
  return <div className="action-inline">
    <button className={environment==="staging"?"secondary-button":"primary-button"} disabled={a.busy} onClick={() => a.run(() => send("/api/projects/" + projectId + "/deploy", {environment})).catch(() => {})}>{a.busy ? "Queued…" : label}</button>
    {a.error && <span className="form-error">{a.error}</span>}
  </div>;
}

export function SecretForm({ projectId }: { projectId: number }) {
  const a = useAction();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      await a.run(() => send("/api/projects/" + projectId + "/secrets", { key: f.get("key"), value: f.get("value"), secret: f.get("secret") === "on" }));
      form.reset();
    } catch {}
  }
  return <form className="inline-form" onSubmit={submit}>
    <input name="key" placeholder="DATABASE_URL" required />
    <input name="value" type="password" placeholder="Value" required />
    <label className="check"><input name="secret" type="checkbox" defaultChecked />Secret</label>
    <button className="secondary-button" disabled={a.busy}>Save variable</button>
    {a.error && <span className="form-error">{a.error}</span>}
  </form>;
}

export function BackupButton() {
  const a = useAction();
  return <div className="action-inline">
    <button className="primary-button" disabled={a.busy} onClick={() => a.run(() => send("/api/backups", {})).catch(() => {})}>{a.busy ? "Requested…" : "Backup now"}</button>
    {a.error && <span className="form-error">{a.error}</span>}
  </div>;
}

export function ProvisionDatabaseButton({ projectId }: { projectId: number }) {
  const a = useAction();
  return <div className="action-inline">
    <button className="secondary-button" disabled={a.busy} onClick={() => a.run(() => send("/api/projects/" + projectId + "/database", {})).catch(() => {})}>{a.busy ? "Provisioning…" : "Provision PostgreSQL"}</button>
    {a.error && <span className="form-error">{a.error}</span>}
  </div>;
}

export function RollbackButton({ deploymentId }: { deploymentId: number }) {
  const a = useAction();
  return <button className="ghost-button" disabled={a.busy} onClick={() => a.run(() => send("/api/deployments/" + deploymentId + "/rollback", {})).catch(() => {})}>{a.busy ? "Queueing…" : "Rollback"}</button>;
}

export function MfaPanel({ enabled }: { enabled: boolean }) {
  const a = useAction();
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  async function begin() {
    try { setSetup(await a.run(() => send("/api/auth/mfa", { action: "begin" }))); } catch {}
  }
  async function confirm() {
    try { await a.run(() => send("/api/auth/mfa", { action: "confirm", code })); setSetup(null); } catch {}
  }
  async function disable() {
    try { await a.run(() => send("/api/auth/mfa", { action: "disable", password })); setPassword(""); } catch {}
  }
  return <div className="stack">
    <div className="row-between"><div><strong>Authenticator MFA</strong><p className="muted">{enabled ? "Enabled" : "Not enabled"}</p></div>{!enabled && !setup && <button className="secondary-button" onClick={begin}>Set up MFA</button>}</div>
    {setup && <div className="mfa-setup"><img src={setup.qr} alt="Authenticator QR code" /><div className="stack"><code>{setup.secret}</code><input value={code} onChange={e => setCode(e.target.value)} placeholder="6-digit code" /><button className="primary-button" onClick={confirm}>Confirm MFA</button></div></div>}
    {enabled && <div className="inline-form"><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Current password" /><button className="danger-button" onClick={disable}>Disable MFA</button></div>}
    {a.error && <div className="form-error">{a.error}</div>}
  </div>;
}
