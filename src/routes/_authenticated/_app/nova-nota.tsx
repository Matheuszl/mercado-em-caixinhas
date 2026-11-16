import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ClipboardPaste, Loader2, PencilLine, QrCode, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useHousehold } from "@/components/household-context";
import { QrScannerView } from "@/components/qr-scanner-view";
import { ReceiptItems } from "@/components/receipt-items";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { summarizeMonth } from "@/lib/budget";
import { currentMonthQuery, errorMessage, sourcesQuery } from "@/lib/household";
import { formatBRL, parseBRNumber } from "@/lib/money";
import { competenceOf, cycleLabel, formatDateTime, monthLabel } from "@/lib/months";
import { fetchNfce } from "@/lib/nfce.functions";
import type { ParsedNfce } from "@/lib/nfce-parse";
import { cn } from "@/lib/utils";
import { SplitPicker } from "@/components/split-picker";
import { splitSum, type SplitMap } from "@/lib/split";

export const Route = createFileRoute("/_authenticated/_app/nova-nota")({
  head: () => ({
    meta: [
      { title: "Nova nota — Caixinha do Mercado" },
      { name: "description", content: "Leia o QR Code da nota fiscal e desconte da fonte escolhida." },
      { property: "og:title", content: "Nova nota — Caixinha do Mercado" },
      { property: "og:description", content: "Leia o QR Code da nota fiscal e desconte da fonte escolhida." },
    ],
  }),
  component: NovaNota,
});

type Draft = {
  origin: "nfce" | "manual";
  data: ParsedNfce;
  qrUrl: string | null;
};

function todaySP() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function NovaNota() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { household } = useHousehold();
  const lookup = useServerFn(fetchNfce);

  const [mode, setMode] = useState<"start" | "scan" | "paste" | "manual">("start");
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [split, setSplit] = useState<SplitMap>({});
  const [saving, setSaving] = useState(false);

  const [manualStore, setManualStore] = useState("");
  const [manualTotal, setManualTotal] = useState("");
  const [manualDate, setManualDate] = useState(todaySP);

  const { data: sources } = useQuery(sourcesQuery(household.id));
  const { data: month } = useQuery(currentMonthQuery(household.id));

  const remaining = useMemo(() => {
    if (!month) return new Map<string, number>();
    const s = summarizeMonth(month.sources, month.charges);
    return new Map(s.sources.map((x) => [x.sourceId, x.remaining]));
  }, [month]);

  const activeSources = (sources ?? []).filter((s) => s.active);
  useEffect(() => setSplit({}), [draft]);
  const totalC = draft ? Math.round(draft.data.total * 100) : 0;
  const splitOk = draft != null && Object.keys(split).length > 0 && splitSum(split) === totalC;

  const readNota = useCallback(
    async (text: string) => {
      setMode("start");
      setLookupError(null);
      setLoading(true);
      try {
        const res = await lookup({ data: { url: text } });
        if (!res.ok) {
          setLookupError(res.error);
          return;
        }
        setDraft({ origin: "nfce", data: res.data, qrUrl: res.sourceUrl });
      } catch (err) {
        setLookupError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [lookup],
  );

  function continueManual() {
    const total = parseBRNumber(manualTotal);
    if (total == null || total <= 0) {
      toast.error("Informe o valor total da compra.");
      return;
    }
    setDraft({
      origin: "manual",
      qrUrl: null,
      data: {
        accessKey: null,
        storeName: manualStore.trim() || "Mercado",
        storeCnpj: null,
        storeAddress: null,
        issuedAt: `${manualDate}T12:00:00-03:00`,
        total,
        items: [],
      },
    });
  }

  async function save() {
    if (!draft || !splitOk) return;
    setSaving(true);
    const d = draft.data;
    const parts = Object.entries(split).filter(([, c]) => c > 0);
    const main = [...parts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? Object.keys(split)[0]!;
    const { data: id, error } = await supabase.rpc("add_receipt", {
      p_household: household.id,
      p_source: main,
      p_splits: (parts.length ? parts : [[main, 0] as [string, number]]).map(([source_id, c]) => ({ source_id, amount: c / 100 })),
      p_access_key: d.accessKey ?? "",
      p_store_name: d.storeName,
      p_store_cnpj: d.storeCnpj ?? "",
      p_store_address: d.storeAddress ?? "",
      p_issued_at: d.issuedAt ?? new Date().toISOString(),
      p_total: d.total,
      p_qr_url: draft.qrUrl ?? "",
      p_origin: draft.origin,
      p_items: d.items,
    });
    setSaving(false);
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["month"] });
    await queryClient.invalidateQueries({ queryKey: ["months"] });
    const nameOf = (id: string) => activeSources.find((s) => s.id === id)?.name;
    toast.success(
      parts.length > 1
        ? `Dividida: ${parts.map(([id, c]) => `${nameOf(id)} ${formatBRL(c / 100)}`).join(" · ")}`
        : `${formatBRL(d.total)} descontado de ${nameOf(main)}`,
    );
    navigate({ to: "/notas/$id", params: { id: id as string }, replace: true });
  }

  if (mode === "scan") {
    return <QrScannerView onResult={readNota} onClose={() => setMode("start")} />;
  }

  return (
    <main className="px-5 pt-6">
      <button
        onClick={() => (draft ? setDraft(null) : navigate({ to: "/inicio" }))}
        className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground"
      >
        <ArrowLeft className="size-4" /> {draft ? "Trocar nota" : "Voltar"}
      </button>
      <h1 className="mt-3 text-4xl font-semibold">{draft ? "Conferir compra" : "Nova nota"}</h1>

      {!draft && (
        <>
          <p className="mt-1 text-muted-foreground">Leia o QR Code impresso no rodapé da nota fiscal.</p>

          {loading && (
            <div className="receipt-paper mt-6 flex items-center gap-3 rounded-t-2xl px-5 pt-5">
              <Loader2 className="size-5 animate-spin text-primary" />
              <p className="font-semibold">Buscando a nota na Sefaz-RS…</p>
            </div>
          )}

          {lookupError && !loading && (
            <div className="mt-6 rounded-2xl border border-negative/40 bg-negative-soft p-4 text-sm">
              <p className="font-semibold text-negative">Não deu para ler essa nota</p>
              <p className="mt-1">{lookupError}</p>
            </div>
          )}

          {!loading && (
            <div className="mt-6 space-y-3">
              <Button variant="ink" size="lg" className="h-16 w-full text-lg" onClick={() => setMode("scan")}>
                <QrCode className="size-6" /> Escanear QR Code
              </Button>

              <div className="rounded-2xl border bg-card p-4 shadow-paper">
                <button
                  className="flex w-full items-center gap-3 text-left font-semibold"
                  onClick={() => setMode(mode === "paste" ? "start" : "paste")}
                >
                  <ClipboardPaste className="size-5 text-primary" /> Colar o link da nota
                </button>
                {mode === "paste" && (
                  <div className="mt-3 space-y-3">
                    <Textarea
                      value={pasted}
                      onChange={(e) => setPasted(e.target.value)}
                      placeholder="https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=…"
                      className="font-num min-h-24 rounded-xl text-xs"
                    />
                    <Button className="w-full" onClick={() => readNota(pasted)} disabled={!pasted.trim()}>
                      Ler nota
                    </Button>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border bg-card p-4 shadow-paper">
                <button
                  className="flex w-full items-center gap-3 text-left font-semibold"
                  onClick={() => setMode(mode === "manual" ? "start" : "manual")}
                >
                  <PencilLine className="size-5 text-primary" /> Lançar sem nota
                </button>
                {mode === "manual" && (
                  <div className="mt-4 space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="store">Onde comprou</Label>
                      <Input id="store" value={manualStore} onChange={(e) => setManualStore(e.target.value)} placeholder="Mercado" className="h-11 rounded-xl" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="total">Valor total</Label>
                        <Input id="total" inputMode="decimal" value={manualTotal} onChange={(e) => setManualTotal(e.target.value)} placeholder="0,00" className="font-num h-11 rounded-xl" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="date">Data</Label>
                        <Input id="date" type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="h-11 rounded-xl" />
                      </div>
                    </div>
                    <Button className="w-full" onClick={continueManual}>Continuar</Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {draft && (
        <div className="mt-5 space-y-6">
          <section className="receipt-paper animate-rise rounded-t-2xl px-5 pt-5">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Store className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold leading-tight">{draft.data.storeName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {draft.data.issuedAt ? formatDateTime(draft.data.issuedAt) : "Agora"}
                  {draft.origin === "manual" ? " · lançamento manual" : ` · ${draft.data.items.length} itens`}
                </p>
              </div>
            </div>
            {draft.data.items.length > 0 && (
              <>
                <div className="dashed-rule my-3" />
                <div className="max-h-72 overflow-y-auto">
                  <ReceiptItems items={draft.data.items} />
                </div>
              </>
            )}
            <div className="dashed-rule my-3" />
            <div className="flex items-baseline justify-between">
              <span className="font-num text-xs uppercase tracking-widest text-muted-foreground">Total</span>
              <span className="font-num text-2xl font-semibold">{formatBRL(draft.data.total)}</span>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Descontar de quem?</h2>
            <div className="mt-3">
              <SplitPicker
                totalC={totalC}
                value={split}
                onChange={setSplit}
                sources={activeSources.map((s) => {
                  const cycle = competenceOf(new Date(draft.data.issuedAt ?? Date.now()), s.closing_day);
                  const inRunningCycle = month?.sources.some((x) => x.source_id === s.id && x.year_month === cycle);
                  const left = inRunningCycle ? remaining.get(s.id) : undefined;
                  const share = (split[s.id] ?? 0) / 100;
                  const after = left != null && share > 0 ? left - share : null;
                  return {
                    id: s.id,
                    name: s.name,
                    hint: (
                      <>
                        {left != null && <span>tem {formatBRL(left)} · </span>}
                        <span>ciclo {cycleLabel(cycle, s.closing_day)}</span>
                        {!inRunningCycle && <span className="block">vai para {monthLabel(cycle).toLowerCase()}</span>}
                        {after != null && (
                          <span className={cn("block font-semibold", after < 0 ? "text-negative" : "text-positive")}>
                            fica {formatBRL(after)}
                          </span>
                        )}
                      </>
                    ),
                  };
                })}
              />
            </div>
          </section>

          <Button variant="yolk" size="lg" className="h-14 w-full text-base" disabled={!splitOk || saving} onClick={save}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            Salvar e descontar {formatBRL(draft.data.total)}
          </Button>
        </div>
      )}
    </main>
  );
}
