import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { formatBRL, parseBRNumber } from "@/lib/money";
import { allTo, evenSplit, setShare, type SplitMap } from "@/lib/split";
import { cn } from "@/lib/utils";

export type SplitSource = { id: string; name: string; hint?: React.ReactNode };

/** Pick who pays: 100% to one source, 50/50, or a custom amount with the rest computed automatically. */
export function SplitPicker({
  sources,
  totalC,
  value,
  onChange,
}: {
  sources: SplitSource[];
  totalC: number;
  value: SplitMap;
  onChange: (v: SplitMap) => void;
}) {
  const ids = sources.map((s) => s.id);
  const used = Object.entries(value).filter(([, c]) => c > 0);
  const whole = used.length === 1 && used[0][1] === totalC ? used[0][0] : null;
  const [custom, setCustom] = useState(!whole && used.length > 0);
  useEffect(() => {
    if (whole && custom && Object.keys(value).length <= 1) setCustom(false);
  }, [whole, custom, value]);

  const even = evenSplit(ids, totalC);
  const isEven = !whole && ids.every((id) => (value[id] ?? 0) === even[id]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {sources.map((s) => (
          <Chip key={s.id} active={whole === s.id && !custom} onClick={() => { setCustom(false); onChange(allTo(s.id, totalC)); }}>
            100% {s.name}
          </Chip>
        ))}
        {sources.length > 1 && (
          <Chip active={isEven && !custom} onClick={() => { setCustom(false); onChange(even); }}>
            {sources.length === 2 ? "50 / 50" : "Partes iguais"}
          </Chip>
        )}
        {sources.length > 1 && (
          <Chip
            active={custom}
            onClick={() => {
              setCustom(true);
              if (used.length === 0) onChange(evenSplit(ids, totalC));
              else onChange(Object.fromEntries(ids.map((id) => [id, value[id] ?? 0])));
            }}
          >
            Dividir valor
          </Chip>
        )}
      </div>

      {(custom || (!whole && used.length > 1)) && (
        <div className="rounded-2xl border bg-card p-4 shadow-paper">
          {sources.length === 2 && (
            <div className="mb-4">
              <input
                type="range"
                aria-label={`Parte de ${sources[0].name}`}
                min={0}
                max={totalC}
                step={totalC >= 1000 ? 50 : 1}
                value={value[ids[0]] ?? 0}
                onChange={(e) => { setCustom(true); onChange(setShare(ids, value, ids[0], Number(e.target.value), totalC)); }}
                className="w-full accent-primary"
              />
              <div className="font-num mt-1 flex justify-between text-[11px] text-muted-foreground">
                <span>{sources[0].name} {pct(value[ids[0]] ?? 0, totalC)}</span>
                <span>{sources[1].name} {pct(value[ids[1]] ?? 0, totalC)}</span>
              </div>
            </div>
          )}
          <div className="space-y-2.5">
            {sources.map((s, i) => (
              <AmountRow
                key={s.id}
                label={s.name}
                auto={i === sources.length - 1}
                cents={value[s.id] ?? 0}
                hint={s.hint}
                onCommit={(c) => { setCustom(true); onChange(setShare(ids, value, s.id, c, totalC)); }}
              />
            ))}
          </div>
          <p className="font-num mt-3 text-[11px] text-muted-foreground">
            Digite o valor de um e o resto vai para {sources[sources.length - 1].name} · total {formatBRL(totalC / 100)}
          </p>
        </div>
      )}
    </div>
  );
}

function pct(c: number, total: number) {
  return total > 0 ? `${Math.round((c / total) * 100)}%` : "0%";
}

function AmountRow({
  label,
  cents,
  auto,
  hint,
  onCommit,
}: {
  label: string;
  cents: number;
  auto: boolean;
  hint?: React.ReactNode;
  onCommit: (c: number) => void;
}) {
  const shown = (cents / 100).toFixed(2).replace(".", ",");
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(shown); }, [shown, focused]);
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{label}</p>
        {hint && <div className="font-num text-[11px] text-muted-foreground">{hint}</div>}
      </div>
      <div className="relative w-32">
        <span className="font-num pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
        <Input
          inputMode="decimal"
          aria-label={`Valor de ${label}`}
          value={text}
          onFocus={(e) => { setFocused(true); e.currentTarget.select(); }}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseBRNumber(e.target.value);
            if (n != null) onCommit(Math.round(n * 100));
          }}
          onBlur={() => setFocused(false)}
          className={cn("font-num h-11 rounded-xl pl-9 text-right", auto && "bg-muted/50")}
        />
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card",
      )}
    >
      {children}
    </button>
  );
}
