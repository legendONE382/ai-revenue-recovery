import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export async function audit(entry: {
  workspaceId?: string | null;
  userId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}) {
  try {
    await db.insert(auditLogs).values({
      workspaceId: entry.workspaceId ?? null,
      userId: entry.userId ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata,
      ip: entry.ip ?? null,
    });
  } catch (e) {
    console.error("[audit] failed to write audit log", e instanceof Error ? e.message : e);
  }
}
