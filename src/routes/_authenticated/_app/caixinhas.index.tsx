import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Archive, ChevronRight } from "lucide-react";
import { useHousehold } from "@/components/household-context";
import { Skeleton } from "@/components/ui/skeleton";
import { summarizeMonth } from "@/lib/budget";
import { errorMessage, monthsListQuery } from "@/lib/household";
import { formatBRL } from "@/lib/money";
import { cycleState, monthLabel } from "@/lib/months";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/caixinhas/")({
  head: () => ({
    meta: [
      { title: "Caixinhas — Caixinha do Mercado" },
      { name: "description", content: "Os meses anteriores guardados, com saldo e compras de cada um." },
      { property: "og:title", content: "Caixinhas — Caixinha do Mercado" },
      { property: "og:description", content: "Os meses anteriores guardados, com saldo e compras de cada um." },
    ],
  }),
  component: Caixinhas,
});

function Caixinhas() {
  const { household } = useHousehold();
  const { data, isLoading, error } = useQuery(monthsListQuery(household.id));

  return (
    <main className="px-5 pt-8">
      <h1 className="text-4xl font-semibold">Caixinhas</h1>
      <p className="mt-1 text-muted-foreground">Cada mês fica guardado aqui. Toque para reabrir.</p>

      <div className="mt-6 space-y-3">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        {error && <p className="text-muted-foreground">{errorMessage(error)}</p>}
        {data?.length === 0 && (
          <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
            <Archive className="mx-auto size-8" />
            <p className="mt-2">Ainda não há meses guardados.</p>
          </div>
        )}
        {data?.map((m, i) => {
          const s = summarizeMonth(
            m.month_sources.map((x) => ({ ...x, budget: Number(x.budget) })),
            m.receipts.map((r) => ({ ...r, total: Number(r.total) })),
          );
          const neg = s.status === "negative";
          const isCurrent = m.month_sources.some((x) => cycleState(m.year_month, x.closing_day) !== "closed");
          return (
            <Link
              key={m.id}
              to="/caixinhas/$mes"
              params={{ mes: m.year_month }}
              className="animate-rise flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-paper active:scale-[0.99]"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div
                className={cn(
                  "flex size-12 shrink-0 items-center justify-center rounded-xl",
                  neg ? "bg-negative-soft text-negative" : "bg-primary-soft text-primary",
                )}
              >
                <Archive className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {monthLabel(m.year_month)}
                  {isCurrent && (
                    <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase text-accent-foreground">
                      em andamento
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.receipts.length} {m.receipts.length === 1 ? "compra" : "compras"} · gasto{" "}
                  <span className="font-num">{formatBRL(s.spent)}</span>
                </p>
              </div>
              <div className="text-right">
                <p className={cn("font-num font-semibold", neg ? "text-negative" : "text-positive")}>
                  {neg ? "−" : "+"}
                  {formatBRL(Math.abs(s.remaining))}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {neg ? "negativo" : "positivo"}
                </p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          );
        })}
      </div>
    </main>
  );
}
