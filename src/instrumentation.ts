/** Runs once when the server starts: loud, early warnings for missing configuration. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { configChecks } = await import("./lib/env");
  const checks = configChecks();
  const missing = checks.filter((c) => c.required && !c.ok);
  const optional = checks.filter((c) => !c.required && !c.ok).map((c) => c.label);
  if (missing.length) {
    console.warn(`[config] Missing required configuration: ${missing.map((c) => `${c.key} (${c.hint})`).join("; ")}`);
  } else {
    console.log("[config] Required configuration present.");
  }
  if (optional.length) console.log(`[config] Optional features not configured: ${optional.join(", ")}`);
}
