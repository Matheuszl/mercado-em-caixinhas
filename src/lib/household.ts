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
};

export type ReceiptRow = {
  id: string;
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

async function loadMonth(monthId: string): Promise<MonthDetail> {
  const [{ data: month, error: e1 }, { data: sources, error: e2 }, { data: receipts, error: e3 }] =
    await Promise.all([
      supabase.from("months").select("id, year_month").eq("id", monthId).single(),
      supabase.from("month_sources").select("id, source_id, name, budget, position").eq("month_id", monthId),
      supabase
        .from("receipts")
        .select("id, source_id, store_name, total, issued_at, origin, created_by_name, receipt_items(count)")
        .eq("month_id", monthId)
        .order("issued_at", { ascending: false }),
    ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  return {
    id: month.id,
    year_month: month.year_month,
    sources: (sources ?? []).map((s) => ({ ...s, budget: Number(s.budget) })),
    receipts: (receipts ?? []).map((r) => ({ ...r, total: Number(r.total) })) as ReceiptRow[],
  };
}

export const currentMonthQuery = (householdId: string) =>
  queryOptions({
    queryKey: ["month", householdId, "current"],
    queryFn: async () => {
      const { data: monthId, error } = await supabase.rpc("ensure_current_month", {
        p_household: householdId,
      });
      if (error) throw error;
      return loadMonth(monthId as string);
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
