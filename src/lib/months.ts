import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const APP_TIMEZONE = "America/Sao_Paulo";

/** "YYYY-MM" for the given date in São Paulo time. */
export function yearMonthOf(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}`;
}

export function currentYearMonth(): string {
  return yearMonthOf(new Date());
}

/** "YYYY-MM-DD" of the given moment in São Paulo time. */
export function dateOf(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function splitYm(ym: string): [number, number] {
  const [y = 2000, m = 1] = ym.split("-").map(Number);
  return [y, m || 1];
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = splitYm(ym);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

function daysInMonth(ym: string): number {
  const [y, m] = splitYm(ym);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Day a cycle starts inside a month; closing days past the month's end fall on its last day. */
export function cycleStartDay(ym: string, closingDay: number): number {
  const d = Math.min(Math.max(Math.trunc(closingDay) || 1, 1), 31);
  return Math.min(d, daysInMonth(ym));
}

/**
 * Cycle ("competência") a moment belongs to for a source that turns over on `closingDay`.
 * Cycles are named after the month they start in: with day 22, 22/10–21/11 is "2026-10".
 * Mirrors the database function `competence_ym`.
 */
export function competenceOf(date: Date, closingDay: number): string {
  const local = dateOf(date);
  const ym = local.slice(0, 7);
  const day = Number(local.slice(8, 10));
  return day >= cycleStartDay(ym, closingDay) ? ym : addMonths(ym, -1);
}

/** First and last day (inclusive, "YYYY-MM-DD") of a source's cycle. */
export function cyclePeriod(ym: string, closingDay: number): { start: string; end: string } {
  const start = `${ym}-${pad(cycleStartDay(ym, closingDay))}`;
  const next = addMonths(ym, 1);
  const nextStart = cycleStartDay(next, closingDay);
  const [ny, nm] = splitYm(next);
  const endDate = new Date(Date.UTC(ny, nm - 1, nextStart - 1));
  const end = `${endDate.getUTCFullYear()}-${pad(endDate.getUTCMonth() + 1)}-${pad(endDate.getUTCDate())}`;
  return { start, end };
}

export type CycleState = "upcoming" | "active" | "closed";

export function cycleState(ym: string, closingDay: number, now: Date = new Date()): CycleState {
  const today = dateOf(now);
  const { start, end } = cyclePeriod(ym, closingDay);
  if (today < start) return "upcoming";
  if (today > end) return "closed";
  return "active";
}

/** Whole days from today until the cycle turns over (0 = turns over tomorrow). */
export function daysLeftInCycle(ym: string, closingDay: number, now: Date = new Date()): number {
  const { end } = cyclePeriod(ym, closingDay);
  const a = Date.parse(`${dateOf(now)}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-10-22" → "22/out" */
export function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}/${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1] ?? ""}`;
}

export function cycleLabel(ym: string, closingDay: number): string {
  const { start, end } = cyclePeriod(ym, closingDay);
  return `${shortDate(start)} – ${shortDate(end)}`;
}

export function monthLabel(ym: string): string {
  const [y = 2000, m = 1] = ym.split("-").map(Number);
  const label = format(new Date(y, (m || 1) - 1, 1), "MMMM 'de' yyyy", { locale: ptBR });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function monthShort(ym: string): string {
  const [y = 2000, m = 1] = ym.split("-").map(Number);
  const label = format(new Date(y, (m || 1) - 1, 1), "MMM", { locale: ptBR });
  return label.replace(".", "");
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: APP_TIMEZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(new Date(iso));
}
