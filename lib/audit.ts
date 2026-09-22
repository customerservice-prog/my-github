import { query } from "@/lib/db";

export async function audit(
  userId: number | null,
  action: string,
  targetType: string,
  targetId?: string | number | null,
  metadata: Record<string, unknown> = {}
) {
  try {
    await query(
      "INSERT INTO audit_logs(user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)",
      [userId, action, targetType, targetId == null ? null : String(targetId), JSON.stringify(metadata)]
    );
  } catch (error) {
    console.error("audit write failed", error);
  }
}
