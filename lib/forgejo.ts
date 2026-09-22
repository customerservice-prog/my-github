type ForgejoRepo = {
  id: number;
  full_name: string;
  name: string;
  clone_url: string;
  html_url: string;
  private: boolean;
  description?: string;
};

function headers(extra: HeadersInit = {}) {
  const h = new Headers(extra);
  h.set("accept", "application/json");
  const token = process.env.FORGEJO_TOKEN;
  if (token) {
    h.set("authorization", "token " + token);
  } else if (process.env.FORGEJO_USER && process.env.FORGEJO_PASSWORD) {
    h.set("authorization", "Basic " + Buffer.from(process.env.FORGEJO_USER + ":" + process.env.FORGEJO_PASSWORD).toString("base64"));
  }
  return h;
}

export async function forgejoFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = process.env.FORGEJO_INTERNAL_URL;
  if (!base) throw new Error("FORGEJO_INTERNAL_URL is required");
  const response = await fetch(base.replace(/\/$/, "") + path, {
    ...init,
    headers: headers(init.headers),
    cache: "no-store"
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error("Forgejo " + response.status + ": " + body.slice(0, 500));
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function listRepositories() {
  return forgejoFetch<ForgejoRepo[]>("/api/v1/user/repos?limit=100&sort=updated");
}

export function createRepository(input: { name: string; description?: string; private?: boolean }) {
  return forgejoFetch<ForgejoRepo>("/api/v1/user/repos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      description: input.description || "",
      private: input.private !== false,
      auto_init: true,
      default_branch: "main"
    })
  });
}

export function importRepository(input: { name: string; cloneUrl: string; private?: boolean }) {
  return forgejoFetch<ForgejoRepo>("/api/v1/repos/migrate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clone_addr: input.cloneUrl,
      repo_name: input.name,
      mirror: false,
      private: input.private !== false,
      service: "git"
    })
  });
}

type ForgejoHook = {
  id: number;
  active: boolean;
  config?: Record<string,string>;
  events?: string[];
};

export async function ensureDeployWebhook(repoFullName: string, _branch: string) {
  const [owner, repo] = repoFullName.split("/");
  if (!owner || !repo) throw new Error("Invalid Forgejo repository name");
  const target = "http://control:3000/api/webhooks/forgejo";
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) throw new Error("WEBHOOK_SECRET is required for automatic deploy hooks");

  const hooks = await forgejoFetch<ForgejoHook[]>(
    "/api/v1/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/hooks"
  );
  const existing = hooks.find(hook => hook.config?.url === target);
  const config = {
    active: true,
    branch_filter: "*",
    events: ["push"],
    name: "my-github-auto-deploy",
    config: {
      url: target,
      content_type: "json",
      secret
    }
  };

  if (existing) {
    const hook = await forgejoFetch<ForgejoHook>(
      "/api/v1/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/hooks/" + existing.id,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config)
      }
    );
    return { id: hook.id, created: false };
  }

  const hook = await forgejoFetch<ForgejoHook>(
    "/api/v1/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/hooks",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "gitea", ...config })
    }
  );
  return { id: hook.id, created: true };
}
