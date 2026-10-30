import { formatBRL } from "@/lib/money";

export type ItemLike = {
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total_price: number;
};

function qty(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(n);
}

export function ReceiptItems({ items }: { items: ItemLike[] }) {
  if (items.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">Sem itens detalhados.</p>;
  }
  return (
    <ul className="divide-y divide-dashed">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-snug">{it.description}</p>
            {it.quantity != null && (
              <p className="font-num mt-0.5 text-[11px] text-muted-foreground">
                {qty(it.quantity)} {it.unit?.toLowerCase() ?? ""}
                {it.unit_price != null ? ` × ${formatBRL(it.unit_price)}` : ""}
              </p>
            )}
          </div>
          <span className="font-num text-sm font-medium">{formatBRL(it.total_price)}</span>
        </li>
      ))}
    </ul>
  );
}
