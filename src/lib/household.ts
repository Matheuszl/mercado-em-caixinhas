import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
};

export type MonthDetail = {
  id: string;
  year_month: string;
  sources: MonthSourceRow[];
  receipts: ReceiptRow[];
};

const RECEIPT_COLUMNS =
  "id, month_id, source_id, store_name, total, issued_at, origin, created_by_name, receipt_items(count)";

async function loadMonth(monthId: string): Promise<MonthDetail> {
  const [{ data: month, error: e1 }, { data: sources, error: e2 }, { data: receipts, error: e3 }] =
    await Promise.all([
      supabase.from("months").select("id, year_month").eq("id", monthId).single(),
      supabase.from("month_sources").select("id, source_id, name, budget, position, closing_day").eq("month_id", monthId),
      supabase
        .from("receipts")
        .select(RECEIPT_COLUMNS)
        .eq("month_id", monthId)
        .order("issued_at", { ascending: false }),
    ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  return {
    id: month.id,
    year_month: month.year_month,
    sources: (sources ?? []).map((s) => ({ ...s, budget: Number(s.budget), year_month: month.year_month })),
    receipts: (receipts ?? []).map((r) => ({ ...r, total: Number(r.total) })) as ReceiptRow[],
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
        return { id: "current", year_month: currentYearMonth(), sources: [], receipts: [] };
      }
      const [{ data: lines, error: e1 }, { data: receipts, error: e2 }] = await Promise.all([
        supabase
          .from("month_sources")
          .select("id, month_id, source_id, name, budget, position, closing_day")
          .in("month_id", monthIds),
        supabase
          .from("receipts")
          .select(RECEIPT_COLUMNS)
          .in("month_id", monthIds)
          .order("issued_at", { ascending: false }),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const sources: MonthSourceRow[] = (lines ?? [])
        .filter((l) => running.has(key(l.month_id, l.source_id)))
        .map(({ month_id, ...l }) => ({
          ...l,
          budget: Number(l.budget),
          year_month: running.get(key(month_id, l.source_id))!,
        }));
      const ownReceipts = (receipts ?? [])
        .filter((r) => running.has(key(r.month_id, r.source_id)))
        .map((r) => ({ ...r, total: Number(r.total) })) as ReceiptRow[];
      return { id: "current", year_month: currentYearMonth(), sources, receipts: ownReceipts };
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
  month_sources: { budget: number; source_id: string; name: string; position: number }[];
  receipts: { total: number; source_id: string }[];
};

export const monthsListQuery = (householdId: string) =>
  queryOptions({
    queryKey: ["months", householdId],
    queryFn: async (): Promise<MonthListRow[]> => {
      const { data, error } = await supabase
        .from("months")
        .select("id, year_month, month_sources(budget, source_id, name, position), receipts(total, source_id)")
        .eq("household_id", householdId)
        .order("year_month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MonthListRow[];
    },
  });

export const sourcesQuery = (householdId: string) =>
  queryOptions({
    queryKey: ["sources", householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sources")
        .select("id, name, default_amount, position, active")
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
