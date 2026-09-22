import Redis from "ioredis";

declare global {
  var __myGithubRedis: Redis | undefined;
}

export function redis() {
  if (!global.__myGithubRedis) {
    if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required");
    global.__myGithubRedis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true
    });
  }
  return global.__myGithubRedis;
}

export async function enqueueDeployment(deploymentId: number) {
  await redis().lpush("deploy:queue", JSON.stringify({ deploymentId }));
}
