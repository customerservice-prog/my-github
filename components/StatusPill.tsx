export function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase().replace(/[^a-z]/g, "");
  return <span className={"status status-" + normalized}><span className="status-dot" />{status}</span>;
}
