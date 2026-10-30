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

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const label = format(new Date(y, (m || 1) - 1, 1), "MMMM 'de' yyyy", { locale: ptBR });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function monthShort(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
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
