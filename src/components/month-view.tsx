import { Link } from "@tanstack/react-router";
import { ChevronRight, ReceiptText } from "lucide-react";
import { dailyAllowance, summarizeMonth } from "@/lib/budget";
import type { MonthDetail } from "@/lib/household";
import { formatBRL } from "@/lib/money";
import {
  cycleLabel,
  cyclePeriod,
  cycleState,
  daysLeftInCycle,
  formatDay,
  monthLabel,
  shortDate,
  spendingDaysLeft,
} from "@/lib/months";
import { cn } from "@/lib/utils";

export function MonthView({ month, isCurrent }: { month: MonthDetail; isCurrent: boolean }) {
  const summary = summarizeMonth(month.sources, month.receipts);
  const negative = summary.status === "negative";
  const pct = Math.min(summary.usedRatio, 1) * 100;
  const sourceName = new Map(month.sources.map((s) => [s.source_id, s.name]));
  const lineOf = new Map(month.sources.map((s) => [s.source_id, s]));

  // Daily pace per source: what is left divided by the days left in that source's own cycle.
  const daily = new Map(
    summary.sources.map((s) => {
      const line = lineOf.get(s.sourceId);
      const days = isCurrent && line ? spendingDaysLeft(line.year_month, line.closing_day) : 0;
      return [s.sourceId, { days, perDay: dailyAllowance(s.remaining, days) }];
    }),
  );
  const totalPerDay = [...daily.values()].reduce((acc, d) => acc + Math.round(d.perDay * 100), 0) / 100;

  return (
    <div className="space-y-6">
      <section className="ink-panel animate-rise relative overflow-hidden rounded-3xl p-6">
        <p className="font-num text-[11px] uppercase tracking-[0.2em] opacity-70">
          {negative ? "Passou do orçamento" : isCurrent ? "Ainda temos" : "Sobrou no mês"}
        </p>
        <p className={cn("font-num mt-2 text-5xl font-semibold", negative && "text-negative")}>
          {formatBRL(negative ? -summary.remaining : summary.remaining)}
        </p>
        <p className="mt-2 text-sm opacity-75">
          Gasto <span className="font-num">{formatBRL(summary.spent)}</span> de{" "}
          <span className="font-num">{formatBRL(summary.budget)}</span>
        </p>
        <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-ink-foreground/15">
          <div
            className={cn("h-full rounded-full transition-all", negative ? "bg-negative" : "bg-accent")}
            style={{ width: `${pct}%` }}
          />
        </div>
        {isCurrent && summary.sources.length > 0 && (
          <div className="mt-5 flex items-baseline justify-between gap-3 border-t border-dashed border-ink-foreground/25 pt-4">
            <p className="text-sm opacity-80">Dá para gastar por dia</p>
            <p className="font-num text-2xl font-semibold text-accent">{formatBRL(totalPerDay)}</p>
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        {summary.sources.map((s, i) => {
          const neg = s.remaining < 0;
          const line = lineOf.get(s.sourceId);
          const ratio = s.budget > 0 ? Math.min(s.spent / s.budget, 1) : s.spent > 0 ? 1 : 0;
          return (
            <div
              key={s.sourceId}
              className={cn(
                "animate-rise rounded-2xl border bg-card p-4 shadow-paper",
                neg && "border-negative/40 bg-negative-soft",
              )}
              style={{ animationDelay: `${60 + i * 40}ms` }}
            >
              <p className="text-sm font-semibold">{s.name}</p>
              <p className={cn("font-num mt-1 text-xl font-semibold", neg ? "text-negative" : "text-positive")}>
                {neg ? "−" : ""}
                {formatBRL(Math.abs(s.remaining))}
              </p>
              <p className="font-num mt-0.5 text-[11px] text-muted-foreground">de {formatBRL(s.budget)}</p>
              {line && (
                <p className="font-num mt-2 text-[11px] leading-snug text-muted-foreground">
                  {cycleLabel(line.year_month, line.closing_day)}
                  {cycleNote(line.year_month, line.closing_day) && (
                    <span className="block font-semibold text-foreground/70">
                      {cycleNote(line.year_month, line.closing_day)}
                    </span>
                  )}
                </p>
              )}
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", neg ? "bg-negative" : "bg-primary")}
                  style={{ width: `${ratio * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-2xl font-semibold">Compras</h2>
          <span className="font-num text-xs text-muted-foreground">
            {month.receipts.length} {month.receipts.length === 1 ? "nota" : "notas"}
          </span>
        </div>

        {month.receipts.length === 0 ? (
          <div className="receipt-paper rounded-t-2xl px-6 pt-6 text-center">
            <ReceiptText className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-semibold">Nenhuma compra em {monthLabel(month.year_month).toLowerCase()}</p>
            {isCurrent && (
              <p className="mt-1 text-sm text-muted-foreground">Toque no + para ler a primeira nota.</p>
            )}
          </div>
        ) : (
          <ul className="receipt-paper divide-y divide-dashed rounded-t-2xl px-4 pt-1">
            {month.receipts.map((r) => (
              <li key={r.id}>
                <Link
                  to="/notas/$id"
                  params={{ id: r.id }}
                  className="flex items-center gap-3 py-3.5 active:opacity-70"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.store_name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="capitalize">{formatDay(r.issued_at)}</span>
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 font-semibold text-primary">
                        {sourceName.get(r.source_id) ?? "Fonte"}
                      </span>
                      {r.receipt_items?.[0]?.count ? <span>{r.receipt_items[0].count} itens</span> : null}
                    </p>
                  </div>
                  <span className="font-num font-semibold">{formatBRL(r.total)}</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Short status of a source's cycle: when it turns over, starts, or that it already closed. */
function cycleNote(ym: string, closingDay: number): string | null {
  const state = cycleState(ym, closingDay);
  if (state === "upcoming") return `começa ${shortDate(cyclePeriod(ym, closingDay).start)}`;
  if (state === "closed") return null;
  const turnsIn = daysLeftInCycle(ym, closingDay) + 1;
  return turnsIn === 1 ? "vira amanhã" : `vira em ${turnsIn} dias`;
}
