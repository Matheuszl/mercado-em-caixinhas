import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Archive } from "lucide-react";
import { useHousehold } from "@/components/household-context";
import { MonthView } from "@/components/month-view";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, monthByYmQuery } from "@/lib/household";
import { cycleState, monthLabel } from "@/lib/months";

export const Route = createFileRoute("/_authenticated/_app/caixinhas/$mes")({
  head: ({ params }) => ({
    meta: [
      { title: `Caixinha de ${params.mes} — Caixinha do Mercado` },
      { name: "description", content: "Saldo e compras de um mês guardado." },
      { property: "og:title", content: "Caixinha do mês — Caixinha do Mercado" },
      { property: "og:description", content: "Saldo e compras de um mês guardado." },
    ],
  }),
  component: CaixinhaMes,
});

function CaixinhaMes() {
  const { mes } = Route.useParams();
  const { household } = useHousehold();
  const { data, isLoading, error } = useQuery(monthByYmQuery(household.id, mes));
  const isCurrent = !!data?.sources.some((s) => cycleState(mes, s.closing_day) !== "closed");

  return (
    <main className="px-5 pt-6">
      <Link to="/caixinhas" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground">
        <ArrowLeft className="size-4" /> Caixinhas
      </Link>
      <header className="mb-5 mt-3">
        <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Archive className="size-4" /> {isCurrent ? "Em andamento" : "Caixinha fechada"}
        </p>
        <h1 className="text-4xl font-semibold">{monthLabel(mes)}</h1>
      </header>
      {isLoading && <Skeleton className="h-44 w-full rounded-3xl" />}
      {error && <p className="text-muted-foreground">{errorMessage(error)}</p>}
      {!isLoading && !error && !data && <p className="text-muted-foreground">Esse mês não tem caixinha.</p>}
      {data && <MonthView month={data} isCurrent={isCurrent} />}
    </main>
  );
}
