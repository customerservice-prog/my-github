import { redirect } from "next/navigation";
import { LoginForm } from "@/components/Forms";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return <main className="login-page">
    <div className="login-orbit orbit-one" />
    <div className="login-orbit orbit-two" />
    <section className="login-card">
      <div className="brand login-brand">
        <div className="brand-mark">MG</div>
        <div><strong>My GitHub</strong><span>Private Dev Cloud</span></div>
      </div>
      <div className="eyebrow">OWNER CONTROL PLANE</div>
      <h1>Your code. Your servers. Your rules.</h1>
      <p className="muted">Repositories, deployments, databases, backups, monitoring and rollback from one private console.</p>
      <LoginForm />
      <p className="tiny muted">The first successful login can bootstrap the owner account from the protected server environment.</p>
    </section>
  </main>;
}
