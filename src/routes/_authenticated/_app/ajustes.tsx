import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, LogOut, Plus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useHousehold } from "@/components/household-context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { errorMessage, membersQuery, sourcesQuery } from "@/lib/household";
import { formatBRL, parseBRNumber } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/_app/ajustes")({
  head: () => ({
    meta: [
      { title: "Ajustes — Caixinha do Mercado" },
      { name: "description", content: "Valores padrão das fontes, convite e conta." },
      { property: "og:title", content: "Ajustes — Caixinha do Mercado" },
      { property: "og:description", content: "Valores padrão das fontes, convite e conta." },
    ],
  }),
  component: Ajustes,
});

type EditableSource = { id: string | null; name: string; amount: string; active: boolean; position: number };

function toInput(n: number) {
  return n.toFixed(2).replace(".", ",");
}

function Ajustes() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { household } = useHousehold();
  const { data: sources } = useQuery(sourcesQuery(household.id));
  const { data: members } = useQuery(membersQuery(household.id));
  const [rows, setRows] = useState<EditableSource[]>([]);
  const [applyNow, setApplyNow] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sources) {
      setRows(sources.map((s) => ({ id: s.id, name: s.name, amount: toInput(s.default_amount), active: s.active, position: s.position })));
    }
  }, [sources]);

  const total = rows.filter((r) => r.active).reduce((acc, r) => acc + (parseBRNumber(r.amount) ?? 0), 0);

  function update(i: number, patch: Partial<EditableSource>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function save() {
    for (const r of rows) {
      const n = parseBRNumber(r.amount);
      if (!r.name.trim()) return toast.error("Toda fonte precisa de um nome.");
      if (n == null || n < 0) return toast.error(`Valor inválido para ${r.name}.`);
    }
    setSaving(true);
    try {
      for (const [i, r] of rows.entries()) {
        const payload = { name: r.name.trim(), default_amount: parseBRNumber(r.amount) ?? 0, active: r.active, position: i };
        const { error } = r.id
          ? await supabase.from("sources").update(payload).eq("id", r.id)
          : await supabase.from("sources").insert({ ...payload, household_id: household.id });
        if (error) throw error;
      }
      const { error } = await supabase.rpc("sync_current_month", { p_household: household.id, p_update_budgets: applyNow });
      if (error) throw error;
      await queryClient.invalidateQueries();
      toast.success(applyNow ? "Salvo e aplicado ao mês atual" : "Salvo. Vale a partir do próximo mês.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(household.invite_code);
      toast.success("Código copiado");
    } catch {
      toast(household.invite_code);
    }
  }

  return (
    <main className="space-y-8 px-5 pt-8">
      <h1 className="text-4xl font-semibold">Ajustes</h1>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">Saldo de cada mês</h2>
          <span className="font-num text-sm text-muted-foreground">{formatBRL(total)}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Todo mês começa com esses valores em cada fonte.</p>
        <div className="mt-4 space-y-3">
          {rows.map((r, i) => (
            <div key={r.id ?? `new-${i}`} className="rounded-2xl border bg-card p-4 shadow-paper">
              <div className="grid grid-cols-[1fr_8rem] gap-3">
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input value={r.name} onChange={(e) => update(i, { name: e.target.value })} className="h-11 rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label>Valor (R$)</Label>
                  <Input
                    inputMode="decimal"
                    value={r.amount}
                    onChange={(e) => update(i, { amount: e.target.value })}
                    className="font-num h-11 rounded-xl text-right"
                  />
                </div>
              </div>
              <label className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                Fonte ativa
                <Switch checked={r.active} onCheckedChange={(v) => update(i, { active: v })} />
              </label>
            </div>
          ))}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setRows((p) => [...p, { id: null, name: "", amount: "0,00", active: true, position: p.length }])}
          >
            <Plus /> Adicionar fonte
          </Button>
        </div>
        <label className="mt-4 flex items-start gap-3 rounded-2xl bg-secondary p-4 text-sm">
          <Checkbox checked={applyNow} onCheckedChange={(v) => setApplyNow(v === true)} className="mt-0.5" />
          <span>
            <span className="font-semibold">Aplicar também ao mês atual</span>
            <br />
            <span className="text-muted-foreground">Se desmarcado, os novos valores valem a partir do próximo mês.</span>
          </span>
        </label>
        <Button className="mt-4 w-full" size="lg" onClick={save} disabled={saving}>
          {saving ? "Salvando…" : "Salvar valores"}
        </Button>
      </section>

      <section className="ink-panel rounded-3xl p-5">
        <div className="flex items-center gap-2">
          <Users className="size-5" />
          <h2 className="text-xl font-semibold">Quem usa</h2>
        </div>
        <ul className="mt-3 space-y-1 text-sm opacity-90">
          {(members ?? []).map((m) => (
            <li key={m.user_id}>
              {m.display_name || m.email} <span className="opacity-60">{m.email}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm opacity-75">Para a outra pessoa entrar, ela faz login e digita este código:</p>
        <button onClick={copyCode} className="font-num mt-2 flex w-full items-center justify-between rounded-2xl bg-ink-foreground/10 px-4 py-3 text-2xl tracking-[0.3em]">
          {household.invite_code}
          <Copy className="size-5" />
        </button>
      </section>

      <Button variant="ghost" size="lg" className="w-full" onClick={signOut}>
        <LogOut /> Sair
      </Button>
    </main>
  );
}
