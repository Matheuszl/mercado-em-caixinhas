import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentYearMonth } from "@/lib/months";

export type Household = { id: string; name: string; invite_code: string };
export type HouseholdMembership = {
  household: Household;
  displayName: string;
  userId: string;
};

export const householdQuery = queryOptions({
  queryKey: ["household"],
  queryFn: async (): Promise<HouseholdMembership | null> => {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return null;
    const { data, error } = await supabase
      .from("household_members")
      .select("display_name, households(id, name, invite_code)")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data || !data.households) return null;
    const h = data.households as unknown as Household;
    return { household: h, displayName: data.display_name, userId: user.id };
  },
});

export type MonthSourceRow = {
  id: string;
  source_id: string;
  name: string;
  budget: number;
  position: number;
  closing_day: number;
  /** Cycle this budget line belongs to (the month's own key, or each source's running cycle on the home screen). */
  year_month: string;
};

export type ReceiptRow = {
  id: string;
  month_id: string;
  source_id: string;
  store_name: string;
  total: number;
  issued_at: string;
  origin: string;
  created_by_name: string | null;
  receipt_items: { count: number }[];
  /** How the receipt was divided between sources (all parts, any cycle). */
  receipt_splits: { source_id: string; amount: number }[];
};

/** One source's share of a receipt that counts in this month. */
export type Charge = { receipt_id: string; source_id: string; total: number; issued_at: string };

export type MonthDetail = {
  id: string;
  year_month: string;
  sources: MonthSourceRow[];
  /** Receipts with at least one share in this month (each once). */
  receipts: ReceiptRow[];
  /** Shares that discount from this month's sources. */
  charges: Charge[];
};

const RECEIPT_COLUMNS =
  "id, month_id, source_id, store_name, total, issued_at, origin, created_by_name, receipt_items(count), receipt_splits(source_id, amount)";

type SplitRow = { month_id: string; source_id: string; amount: number; receipts: unknown };

async function loadSplits(monthIds: string[]): Promise<SplitRow[]> {
  const { data, error } = await supabase
    .from("receipt_splits")
    .select(`month_id, source_id, amount, receipts(${RECEIPT_COLUMNS})`)
    .in("month_id", monthIds);
  if (error) throw error;
  return (data ?? []) as unknown as SplitRow[];
}

function fromSplits(splits: SplitRow[]): { receipts: ReceiptRow[]; charges: Charge[] } {
  const byId = new Map<string, ReceiptRow>();
  const charges: Charge[] = [];
  for (const sp of splits) {
    const r = sp.receipts as ReceiptRow | null;
    if (!r) continue;
    if (!byId.has(r.id)) {
      byId.set(r.id, {
        ...r,
        total: Number(r.total),
        receipt_splits: (r.receipt_splits ?? []).map((x) => ({ ...x, amount: Number(x.amount) })),
      });
    }
    charges.push({ receipt_id: r.id, source_id: sp.source_id, total: Number(sp.amount), issued_at: r.issued_at });
  }
  const receipts = [...byId.values()].sort((a, b) => b.issued_at.localeCompare(a.issued_at));
  return { receipts, charges };
}

async function loadMonth(monthId: string): Promise<MonthDetail> {
  const [{ data: month, error: e1 }, { data: sources, error: e2 }, splits] = await Promise.all([
    supabase.from("months").select("id, year_month").eq("id", monthId).single(),
    supabase.from("month_sources").select("id, source_id, name, budget, position, closing_day").eq("month_id", monthId),
    loadSplits([monthId]),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return {
    id: month.id,
    year_month: month.year_month,
    sources: (sources ?? []).map((s) => ({ ...s, budget: Number(s.budget), year_month: month.year_month })),
    ...fromSplits(splits),
  };
}

/**
 * What is running right now: each active source in its own current cycle
 * (e.g. Matheus 22/10–21/11 and Maria 01/11–30/11 on 05/11).
 */
export const currentMonthQuery = (householdId: string) =>
  queryOptions({
    queryKey: ["month", householdId, "current"],
    queryFn: async (): Promise<MonthDetail> => {
      const { data: cycles, error } = await supabase.rpc("ensure_current_cycles", { p_household: householdId });
      if (error) throw error;
      const rows = cycles ?? [];
      const monthIds = [...new Set(rows.map((c) => c.month_id))];
      const key = (monthId: string, sourceId: string) => `${monthId}:${sourceId}`;
      const running = new Map(rows.map((c) => [key(c.month_id, c.source_id), c.year_month]));
      if (monthIds.length === 0) {
        return { id: "current", year_month: currentYearMonth(), sources: [], receipts: [], charges: [] };
      }
      const [{ data: lines, error: e1 }, splits] = await Promise.all([
        supabase
          .from("month_sources")
          .select("id, month_id, source_id, name, budget, position, closing_day")
          .in("month_id", monthIds),
        loadSplits(monthIds),
      ]);
      if (e1) throw e1;
      const sources: MonthSourceRow[] = (lines ?? [])
        .filter((l) => running.has(key(l.month_id, l.source_id)))
        .map(({ month_id, ...l }) => ({
          ...l,
          budget: Number(l.budget),
          year_month: running.get(key(month_id, l.source_id))!,
        }));
      const own = fromSplits(splits.filter((sp) => running.has(key(sp.month_id, sp.source_id))));
      return { id: "current", year_month: currentYearMonth(), sources, ...own };
    },
  });

export const monthByYmQuery = (householdId: string, ym: string) =>
  queryOptions({
    queryKey: ["month", householdId, ym],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("months")
        .select("id")
        .eq("household_id", householdId)
        .eq("year_month", ym)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return loadMonth(data.id);
    },
  });

export type MonthListRow = {
  id: string;
  year_month: string;
  month_sources: { budget: number; source_id: string; name: string; position: number; closing_day: number }[];
  receipts: { total: number; source_id: string }[];
};

export const monthsListQuery = (householdId: string) =>
  queryOptions({
    queryKey: ["months", householdId],
    queryFn: async (): Promise<MonthListRow[]> => {
      const { data, error } = await supabase
        .from("months")
        .select("id, year_month, month_sources(budget, source_id, name, position, closing_day), receipt_splits(amount, source_id)")
        .eq("household_id", householdId)
        .order("year_month", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((m) => ({
        ...m,
        receipts: (m.receipt_splits ?? []).map((x) => ({ source_id: x.source_id, total: Number(x.amount) })),
      })) as unknown as MonthListRow[];
    },
  });

export const sourcesQuery = (householdId: string) =>
  queryOptions({
    queryKey: ["sources", householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sources")
        .select("id, name, default_amount, position, active, closing_day")
        .eq("household_id", householdId)
        .order("position");
      if (error) throw error;
      return (data ?? []).map((s) => ({ ...s, default_amount: Number(s.default_amount) }));
    },
  });

export const membersQuery = (householdId: string) =>
  queryOptions({
    queryKey: ["members", householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("household_members")
        .select("user_id, display_name, email")
        .eq("household_id", householdId)
        .order("joined_at");
      if (error) throw error;
      return data ?? [];
    },
  });

export function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) return String((err as { message: string }).message);
  return "Algo deu errado. Tente de novo.";
}
