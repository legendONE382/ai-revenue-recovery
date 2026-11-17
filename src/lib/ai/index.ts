import "server-only";
import { eq } from "drizzle-orm";
import type { ZodSchema } from "zod";
import { db } from "@/db";
import { agentExecutionLogs, aiProviderKeys, workspaces } from "@/db/schema";
import { decrypt, isEncryptionConfigured } from "@/lib/crypto";
import { chat, DEFAULT_MODELS, extractJson, PROVIDERS, type AiTask, type ChatRequest, type ProviderConfig, type ProviderId } from "./providers";

const ENV_KEYS: Record<ProviderId, string> = { gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY", mistral: "MISTRAL_API_KEY", openai: "OPENAI_API_KEY" };

/** Resolves provider configs for a workspace: user-supplied keys first, then managed (env) keys. */
export async function resolveProviders(workspaceId: string, task: AiTask): Promise<ProviderConfig[]> {
  const [ws] = await db.select({ settings: workspaces.settings }).from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws?.settings?.aiProcessingAllowed) return []; // explicit owner consent required
  const userKeys = isEncryptionConfigured()
    ? await db.select().from(aiProviderKeys).where(eq(aiProviderKeys.workspaceId, workspaceId))
    : [];
  const order = (ws.settings.aiProviderOrder?.length ? ws.settings.aiProviderOrder : PROVIDERS) as ProviderId[];
  const configs: ProviderConfig[] = [];
  for (const id of order) {
    if (!PROVIDERS.includes(id)) continue;
    const uk = userKeys.find((k) => k.provider === id);
    let apiKey: string | undefined;
    if (uk) {
      try {
        apiKey = decrypt(uk.keyEnc, `aikey:${workspaceId}:${id}`);
      } catch {
        apiKey = undefined;
      }
    }
    apiKey ??= process.env[ENV_KEYS[id]];
    if (!apiKey) continue;
    const model = uk?.model || process.env[`AI_MODEL_${id.toUpperCase()}_${task.toUpperCase()}`] || DEFAULT_MODELS[id][task];
    configs.push({ id, apiKey, model });
  }
  return configs;
}

export async function aiAvailable(workspaceId: string, task: AiTask) {
  return (await resolveProviders(workspaceId, task)).length > 0;
}

/**
 * Runs a structured LLM call: provider fallback, JSON parsing, Zod validation and usage logging.
 * Returns null when AI is disabled/unavailable or every provider fails — callers must then use
 * their deterministic fallback.
 */
export async function runStructured<T>(args: {
  workspaceId: string;
  task: AiTask;
  agent: string;
  promptVersion: string;
  schema: ZodSchema<T>;
  request: ChatRequest;
  targetRef?: string;
  taskId?: string | null;
}): Promise<{ data: T; provider: string; model: string } | null> {
  const configs = await resolveProviders(args.workspaceId, args.task);
  if (configs.length === 0) return null;
  const started = Date.now();
  let parsed: T | null = null;
  try {
    const r = await chat(configs, { ...args.request, json: true }, {
      validate: (res) => {
        const out = args.schema.safeParse(extractJson(res.text));
        if (out.success) parsed = out.data;
        return out.success;
      },
    });
    await db.insert(agentExecutionLogs).values({
      workspaceId: args.workspaceId,
      taskId: args.taskId ?? null,
      agent: args.agent,
      targetRef: args.targetRef,
      status: "ok",
      provider: r.provider,
      model: r.model,
      promptVersion: args.promptVersion,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      durationMs: Date.now() - started,
      output: { attempts: r.attempts },
    });
    return parsed ? { data: parsed, provider: r.provider, model: r.model } : null;
  } catch (e) {
    await db.insert(agentExecutionLogs).values({
      workspaceId: args.workspaceId,
      taskId: args.taskId ?? null,
      agent: args.agent,
      targetRef: args.targetRef,
      status: "error",
      promptVersion: args.promptVersion,
      durationMs: Date.now() - started,
      error: e instanceof Error ? e.message.slice(0, 500) : "error",
    });
    return null;
  }
}
