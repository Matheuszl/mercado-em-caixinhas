import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Store, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useHousehold } from "@/components/household-context";
import { ReceiptItems } from "@/components/receipt-items";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, sourcesQuery } from "@/lib/household";
import { formatBRL } from "@/lib/money";
import { currentYearMonth, formatDateTime, monthLabel } from "@/lib/months";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/notas/$id")({
  head: () => ({
    meta: [
      { title: "Nota fiscal — Caixinha do Mercado" },
      { name: "description", content: "Itens e valor de uma compra do mercado." },
      { property: "og:title", content: "Nota fiscal — Caixinha do Mercado" },
      { property: "og:description", content: "Itens e valor de uma compra do mercado." },
    ],
  }),
  component: NotaDetalhe,
});

function NotaDetalhe() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { household } = useHousehold();
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["receipt", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("receipts")
        .select(
          "id, source_id, access_key, store_name, store_cnpj, store_address, issued_at, total, qr_url, origin, created_by_name, months(year_month), receipt_items(description, quantity, unit, unit_price, total_price, position)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: sources } = useQuery(sourcesQuery(household.id));

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["receipt", id] }),
      queryClient.invalidateQueries({ queryKey: ["month"] }),
      queryClient.invalidateQueries({ queryKey: ["months"] }),
    ]);
  }

  async function changeSource(sourceId: string) {
    if (!data || sourceId === data.source_id) return;
    setBusy(true);
    const { error } = await supabase.from("receipts").update({ source_id: sourceId }).eq("id", id);
    if (!error) {
      // Make sure the month has a budget line for this source.
      const ym = (data.months as unknown as { year_month: string } | null)?.year_month;
      if (ym) await supabase.rpc("ensure_month", { p_household: household.id, p_ym: ym });
    }
    setBusy(false);
    if (error) { toast.error(errorMessage(error)); return; }
    toast.success("Fonte alterada");
    refresh();
  }

  async function remove() {
    setBusy(true);
    const { error } = await supabase.from("receipts").delete().eq("id", id);
    setBusy(false);
    if (error) { toast.error(errorMessage(error)); return; }
    await queryClient.invalidateQueries({ queryKey: ["month"] });
    await queryClient.invalidateQueries({ queryKey: ["months"] });
    toast.success("Compra apagada e valor devolvido à fonte");
    navigate({ to: "/inicio", replace: true });
  }

  if (isLoading) {
    return (
      <main className="space-y-4 px-5 pt-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 rounded-2xl" />
      </main>
    );
  }
  if (error || !data) {
    return (
      <main className="px-5 pt-8">
        <p className="text-muted-foreground">{error ? errorMessage(error) : "Nota não encontrada."}</p>
      </main>
    );
  }

  const ym = (data.months as unknown as { year_month: string } | null)?.year_month ?? currentYearMonth();
  const items = [...(data.receipt_items ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((i) => ({
      ...i,
      quantity: i.quantity == null ? null : Number(i.quantity),
      unit_price: i.unit_price == null ? null : Number(i.unit_price),
      total_price: Number(i.total_price),
    }));
  const backTo = ym === currentYearMonth();

  return (
    <main className="px-5 pt-6">
      {backTo ? (
        <Link to="/inicio" className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground">
          <ArrowLeft className="size-4" /> {monthLabel(ym)}
        </Link>
      ) : (
        <Link to="/caixinhas/$mes" params={{ mes: ym }} className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground">
          <ArrowLeft className="size-4" /> {monthLabel(ym)}
        </Link>
      )}

      <section className="receipt-paper animate-rise mt-4 rounded-t-2xl px-5 pt-5">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Store className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight">{data.store_name}</h1>
            {data.store_cnpj && <p className="font-num text-[11px] text-muted-foreground">CNPJ {data.store_cnpj}</p>}
            {data.store_address && <p className="text-xs text-muted-foreground">{data.store_address}</p>}
          </div>
        </div>
        <p className="font-num mt-3 text-xs text-muted-foreground">
          {formatDateTime(data.issued_at)}
          {data.created_by_name ? ` · lançada por ${data.created_by_name}` : ""}
          {data.origin === "manual" ? " · manual" : ""}
        </p>
        <div className="dashed-rule my-3" />
        <ReceiptItems items={items} />
        <div className="dashed-rule my-3" />
        <div className="flex items-baseline justify-between">
          <span className="font-num text-xs uppercase tracking-widest text-muted-foreground">Total</span>
          <span className="font-num text-3xl font-semibold">{formatBRL(Number(data.total))}</span>
        </div>
        {data.access_key && (
          <p className="font-num mt-4 break-all text-center text-[10px] text-muted-foreground">
            {data.access_key.replace(/(\d{4})/g, "$1 ").trim()}
          </p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Descontado de</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {(sources ?? []).map((s) => (
            <button
              key={s.id}
              disabled={busy}
              onClick={() => changeSource(s.id)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                s.id === data.source_id ? "border-primary bg-primary text-primary-foreground" : "bg-card",
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      </section>

      <div className="mt-6 flex flex-col gap-3">
        {data.qr_url && (
          <Button variant="outline" size="lg" asChild>
            <a href={data.qr_url} target="_blank" rel="noreferrer">
              <ExternalLink /> Ver nota original na Sefaz
            </a>
          </Button>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="lg" className="text-negative hover:text-negative">
              <Trash2 /> Apagar compra
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apagar essa compra?</AlertDialogTitle>
              <AlertDialogDescription>
                O valor de {formatBRL(Number(data.total))} volta para o saldo da fonte.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={remove}>Apagar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </main>
  );
}
