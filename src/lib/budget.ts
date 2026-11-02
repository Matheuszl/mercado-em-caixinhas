import { cents, fromCents } from "./money";

export type MonthSourceInput = {
  source_id: string;
  name: string;
  budget: number;
  position: number;
};

export type ReceiptInput = {
  source_id: string;
  total: number;
};

export type SourceSummary = {
  sourceId: string;
  name: string;
  budget: number;
  spent: number;
  remaining: number;
  count: number;
};

export type MonthSummary = {
  sources: SourceSummary[];
  budget: number;
  spent: number;
  remaining: number;
  /** "positive" when the month ended (or is) within budget, "negative" when spending exceeded it. */
  status: "positive" | "negative";
  usedRatio: number;
};

/**
 * Balance of a month: each source starts at its budget and every receipt
 * discounts its total from the source it was charged to.
 */
export function summarizeMonth(
  monthSources: MonthSourceInput[],
  receipts: ReceiptInput[],
): MonthSummary {
  const ordered = [...monthSources].sort((a, b) => a.position - b.position);
  const known = new Set(ordered.map((s) => s.source_id));

  const sources: SourceSummary[] = ordered.map((s) => {
    const own = receipts.filter((r) => r.source_id === s.source_id);
    const spentC = own.reduce((acc, r) => acc + cents(Number(r.total)), 0);
    const budgetC = cents(Number(s.budget));
    return {
      sourceId: s.source_id,
      name: s.name,
      budget: fromCents(budgetC),
      spent: fromCents(spentC),
      remaining: fromCents(budgetC - spentC),
      count: own.length,
    };
  });

  // Receipts charged to a source that has no budget line this month still count as spending.
  const orphanC = receipts
    .filter((r) => !known.has(r.source_id))
    .reduce((acc, r) => acc + cents(Number(r.total)), 0);

  const budgetC = sources.reduce((acc, s) => acc + cents(s.budget), 0);
  const spentC = sources.reduce((acc, s) => acc + cents(s.spent), 0) + orphanC;
  const remainingC = budgetC - spentC;

  return {
    sources,
    budget: fromCents(budgetC),
    spent: fromCents(spentC),
    remaining: fromCents(remainingC),
    status: remainingC < 0 ? "negative" : "positive",
    usedRatio: budgetC > 0 ? spentC / budgetC : spentC > 0 ? 1 : 0,
  };
}

/** How much can be spent per day to end the cycle at zero (0 when nothing is left or no days remain). */
export function dailyAllowance(remaining: number, daysLeft: number): number {
  const remC = cents(Number(remaining));
  if (daysLeft <= 0 || remC <= 0) return 0;
  return fromCents(Math.floor(remC / daysLeft));
}

export type PaceLevel = "ok" | "atencao" | "acima";

export type SpendingPace = {
  /** Average spent per day over the recent window. */
  ratePerDay: number;
  windowDays: number;
  /** Expected balance at turnover if the recent pace continues. */
  projected: number;
  /** Days from today until the balance hits zero at this pace (null if it lasts the cycle). */
  runsOutInDays: number | null;
  level: PaceLevel;
};

/**
 * Projects the end of a cycle from the recent spending pace.
 * `recentSpent` is what was spent in the last `windowDays` days (including today);
 * `daysLeft` counts today, `allowance` is the per-day amount that ends the cycle at zero.
 */
export function spendingPace(
  remaining: number,
  recentSpent: number,
  windowDays: number,
  daysLeft: number,
  allowance: number,
): SpendingPace {
  const remC = cents(Number(remaining));
  const w = Math.max(windowDays, 1);
  const rateC = Math.round(cents(Number(recentSpent)) / w);
  // Today already counts in the window, so project over the remaining days after today.
  const ahead = Math.max(daysLeft - 1, 0);
  const projectedC = remC - rateC * ahead;
  const runsOutInDays =
    remC <= 0 ? 0 : rateC > 0 && projectedC < 0 ? Math.floor(remC / rateC) : null;
  const allowC = cents(Number(allowance));
  const level: PaceLevel =
    remC <= 0 || projectedC < 0
      ? rateC > allowC * 1.25 || remC <= 0
        ? "acima"
        : "atencao"
      : rateC > allowC
        ? "atencao"
        : "ok";
  return { ratePerDay: fromCents(rateC), windowDays: w, projected: fromCents(projectedC), runsOutInDays, level };
}
