/**
 * Provider-independent LLM adapters. Business logic depends only on `chat()` —
 * swapping Gemini ↔ Groq ↔ Mistral ↔ OpenAI requires no changes elsewhere.
 */
export type ProviderId = "gemini" | "groq" | "mistral" | "openai";
export type AiTask = "classify" | "draft" | "assistant";

export type ChatRequest = { system: string; user: string; json?: boolean; maxTokens?: number; temperature?: number };
export type ChatResult = { text: string; provider: ProviderId; model: string; tokensIn: number; tokensOut: number };
export type ProviderConfig = { id: ProviderId; apiKey: string; model: string };

export class ProviderError extends Error {
  constructor(message: string, public status: number | null, public retryable: boolean) {
    super(message);
  }
}

export const PROVIDERS: ProviderId[] = ["gemini", "groq", "mistral", "openai"];

/** Inexpensive defaults per task (override with AI_MODEL_<PROVIDER>_<TASK>, e.g. AI_MODEL_GROQ_DRAFT). */
export const DEFAULT_MODELS: Record<ProviderId, Record<AiTask, string>> = {
  gemini: { classify: "gemini-2.5-flash-lite", draft: "gemini-2.5-flash", assistant: "gemini-2.5-flash" },
  groq: { classify: "llama-3.1-8b-instant", draft: "llama-3.3-70b-versatile", assistant: "llama-3.3-70b-versatile" },
  mistral: { classify: "mistral-small-latest", draft: "mistral-small-latest", assistant: "mistral-small-latest" },
  openai: { classify: "gpt-4o-mini", draft: "gpt-4o-mini", assistant: "gpt-4o-mini" },
};

const OPENAI_COMPAT_URL: Record<Exclude<ProviderId, "gemini">, string> = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  mistral: "https://api.mistral.ai/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
};

type FetchFn = typeof fetch;

async function callOnce(cfg: ProviderConfig, req: ChatRequest, fetchFn: FetchFn, timeoutMs: number): Promise<ChatResult> {
  let res: Response;
  if (cfg.id === "gemini") {
    res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.user }] }],
        generationConfig: {
          temperature: req.temperature ?? 0.2,
          maxOutputTokens: req.maxTokens ?? 800,
          ...(req.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } else {
    res = await fetchFn(OPENAI_COMPAT_URL[cfg.id], {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxTokens ?? 800,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
        ...(req.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  }
  if (!res.ok) {
    const retryable = res.status === 429 || res.status >= 500;
    throw new ProviderError(`${cfg.id} HTTP ${res.status}`, res.status, retryable);
  }
  const data = (await res.json()) as Record<string, unknown>;
  if (cfg.id === "gemini") {
    const cands = data.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
    const text = cands?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const usage = data.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number } | undefined;
    return { text, provider: cfg.id, model: cfg.model, tokensIn: usage?.promptTokenCount ?? 0, tokensOut: usage?.candidatesTokenCount ?? 0 };
  }
  const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
  const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
  return { text: choices?.[0]?.message?.content ?? "", provider: cfg.id, model: cfg.model, tokensIn: usage?.prompt_tokens ?? 0, tokensOut: usage?.completion_tokens ?? 0 };
}

/**
 * Calls providers in order with per-provider retries (exponential backoff on 429/5xx) and
 * falls back to the next provider on failure. `validate` lets callers reject malformed output,
 * which also triggers fallback.
 */
export async function chat(
  configs: ProviderConfig[],
  req: ChatRequest,
  opts: { fetchFn?: FetchFn; retries?: number; timeoutMs?: number; validate?: (r: ChatResult) => boolean; sleep?: (ms: number) => Promise<void> } = {},
): Promise<ChatResult & { attempts: string[] }> {
  const fetchFn = opts.fetchFn ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const attempts: string[] = [];
  for (const cfg of configs) {
    for (let attempt = 0; attempt <= (opts.retries ?? 2); attempt++) {
      try {
        const r = await callOnce(cfg, req, fetchFn, opts.timeoutMs ?? 20_000);
        if (opts.validate && !opts.validate(r)) {
          attempts.push(`${cfg.id}:${cfg.model}:invalid_output`);
          break; // don't retry same provider for schema failures; fall back
        }
        attempts.push(`${cfg.id}:${cfg.model}:ok`);
        return { ...r, attempts };
      } catch (e) {
        const pe = e instanceof ProviderError ? e : new ProviderError(e instanceof Error ? e.message : "error", null, true);
        attempts.push(`${cfg.id}:${cfg.model}:${pe.status ?? "network"}`);
        if (!pe.retryable) break;
        await sleep(Math.min(8000, 500 * 2 ** attempt));
      }
    }
  }
  throw new ProviderError(`All AI providers failed (${attempts.join(", ")})`, null, false);
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}
