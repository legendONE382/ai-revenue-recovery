import { describe, expect, it } from "vitest";
import { buildDemoMessages, DEMO_OWNER } from "@/lib/fixtures/demo-emails";
import { analyseThread } from "@/lib/intel/thread";
import { validateCandidate } from "@/lib/intel/qa";
import type { OpportunityCategory } from "@/lib/intel/types";

/**
 * Precision / recall of the deterministic pipeline on the labelled sample dataset.
 * Run: npx vitest run tests/evaluation.test.ts
 */
describe("evaluation on labelled sample conversations", () => {
  const now = new Date();
  const { specs, messages } = buildDemoMessages(now);
  let tp = 0, fp = 0, fn = 0, classOk = 0;
  const perCat: Record<string, { tp: number; fp: number; fn: number }> = {};
  const rows: string[] = [];

  for (const s of specs) {
    const msgs = messages.filter((m) => m.providerThreadId === s.id);
    const a = analyseThread(msgs, { ownerEmails: new Set([DEMO_OWNER.email]), now });
    const predicted = new Set(a.candidates.map((c) => validateCandidate(c, a, msgs)).filter((r) => r.accepted).map((r) => r.candidate.category));
    const expected = new Set<OpportunityCategory>(s.expected.categories);
    if (a.classification === s.expected.classification) classOk++;
    for (const c of new Set([...predicted, ...expected])) {
      perCat[c] ??= { tp: 0, fp: 0, fn: 0 };
      if (predicted.has(c) && expected.has(c)) { tp++; perCat[c].tp++; }
      else if (predicted.has(c)) { fp++; perCat[c].fp++; }
      else { fn++; perCat[c].fn++; }
    }
    rows.push(`${s.id.padEnd(22)} class=${a.classification.padEnd(12)} (exp ${s.expected.classification.padEnd(12)}) pred=[${[...predicted].join(",")}] exp=[${[...expected].join(",")}]`);
  }
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);

  it("reports metrics", () => {
    console.log(rows.join("\n"));
    console.log(`Opportunity detection — precision ${(precision * 100).toFixed(1)}%, recall ${(recall * 100).toFixed(1)}% (tp=${tp} fp=${fp} fn=${fn})`);
    console.log(`Thread classification accuracy ${((classOk / specs.length) * 100).toFixed(1)}%`);
    console.log("Per category:", JSON.stringify(perCat));
    expect(precision).toBeGreaterThanOrEqual(0.9);
    expect(recall).toBeGreaterThanOrEqual(0.9);
  });
});
