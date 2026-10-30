import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useHousehold } from "@/components/household-context";
import { MonthView } from "@/components/month-view";
import { Skeleton } from "@/components/ui/skeleton";
import { currentMonthQuery, errorMessage } from "@/lib/household";
import { monthLabel } from "@/lib/months";

export const Route = createFileRoute("/_authenticated/_app/inicio")({
  head: () => ({
    meta: [
      { title: "Mês atual — Caixinha do Mercado" },
      { name: "description", content: "Saldo do mercado deste mês e as compras já lançadas." },
      { property: "og:title", content: "Mês atual — Caixinha do Mercado" },
      { property: "og:description", content: "Saldo do mercado deste mês e as compras já lançadas." },
    ],
  }),
  component: Inicio,
});

function Inicio() {
  const { household, displayName } = useHousehold();
  const { data, isLoading, error } = useQuery(currentMonthQuery(household.id));

  return (
    <main className="px-5 pt-8">
      <header className="mb-5">
        <p className="text-sm text-muted-foreground">Oi, {displayName || "você"} 👋</p>
        <h1 className="text-4xl font-semibold">{data ? monthLabel(data.year_month) : "Este mês"}</h1>
      </header>
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-44 w-full rounded-3xl" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
        </div>
      )}
      {error && <p className="text-muted-foreground">{errorMessage(error)}</p>}
      {data && <MonthView month={data} isCurrent />}
    </main>
  );
}
