import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Archive, Home, Plus, Settings, ShoppingBasket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { householdQuery, errorMessage } from "@/lib/household";
import { HouseholdContext } from "@/components/household-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/_app")({
  component: AppShell,
});

function AppShell() {
  const { user } = Route.useRouteContext();
  const { data, isLoading, error } = useQuery(householdQuery);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-5 pt-10">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-44 w-full rounded-3xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>
    );
  }
  if (error) {
    return <p className="p-8 text-center text-muted-foreground">{errorMessage(error)}</p>;
  }
  if (!data) {
    const meta = user.user_metadata as { full_name?: string; name?: string };
    const firstName = (meta.full_name || meta.name || user.email || "").split(" ")[0];
    return <Onboarding defaultName={firstName} />;
  }

  return (
    <HouseholdContext.Provider value={data}>
      <div className="mx-auto min-h-dvh max-w-md pb-28">
        <Outlet />
      </div>
      <BottomNav />
    </HouseholdContext.Provider>
  );
}

function BottomNav() {
  const item =
    "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-semibold text-muted-foreground transition-colors data-[status=active]:text-primary";
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur">
      <div className="relative mx-auto flex max-w-md items-end px-4">
        <Link to="/inicio" className={item}>
          <Home className="size-5" /> Mês
        </Link>
        <Link to="/caixinhas" className={item}>
          <Archive className="size-5" /> Caixinhas
        </Link>
        <div className="flex flex-1 justify-center">
          <Link
            to="/nova-nota"
            aria-label="Nova nota"
            className="-mt-7 flex size-16 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lift ring-4 ring-background transition-transform active:scale-95"
          >
            <Plus className="size-7" strokeWidth={2.5} />
          </Link>
        </div>
        <Link to="/ajustes" className={item}>
          <Settings className="size-5" /> Ajustes
        </Link>
      </div>
    </nav>
  );
}

function Onboarding({ defaultName }: { defaultName: string }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(defaultName);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);

  async function create() {
    setBusy("create");
    const { error } = await supabase.rpc("create_household", { p_name: "Nossa casa", p_display_name: name });
    setBusy(null);
    if (error) return toast.error(errorMessage(error));
    toast.success("Casa criada! Compartilhe o código em Ajustes.");
    queryClient.invalidateQueries();
  }

  async function join() {
    setBusy("join");
    const { error } = await supabase.rpc("join_household", { p_code: code, p_display_name: name });
    setBusy(null);
    if (error) return toast.error(errorMessage(error));
    toast.success("Pronto, você entrou na casa!");
    queryClient.invalidateQueries();
  }

  return (
    <main className="mx-auto max-w-md px-6 py-10">
      <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <ShoppingBasket className="size-6" />
      </div>
      <h1 className="mt-6 text-4xl font-semibold">Bem-vindo à caixinha</h1>
      <p className="mt-2 text-muted-foreground">
        Crie a casa (a primeira pessoa) ou entre com o código que a outra pessoa recebeu.
      </p>

      <div className="mt-8 space-y-2">
        <Label htmlFor="name">Como você quer ser chamado</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="h-12 rounded-xl bg-card" />
      </div>

      <section className="mt-6 rounded-3xl border bg-card p-5 shadow-paper">
        <h2 className="text-xl font-semibold">Criar a casa</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Já começa com as fontes Matheus (R$ 1.200,00) e Maria (R$ 500,00).
        </p>
        <Button className="mt-4 w-full" size="lg" onClick={create} disabled={!!busy || !name.trim()}>
          {busy === "create" ? "Criando…" : "Criar nossa casa"}
        </Button>
      </section>

      <section className="mt-4 rounded-3xl border bg-card p-5 shadow-paper">
        <h2 className="text-xl font-semibold">Tenho um código</h2>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Ex.: A1B2C3"
          maxLength={6}
          className="font-num mt-3 h-12 rounded-xl text-center text-lg tracking-[0.3em]"
        />
        <Button variant="outline" className="mt-3 w-full" size="lg" onClick={join} disabled={!!busy || code.length < 6 || !name.trim()}>
          {busy === "join" ? "Entrando…" : "Entrar na casa"}
        </Button>
      </section>
    </main>
  );
}
