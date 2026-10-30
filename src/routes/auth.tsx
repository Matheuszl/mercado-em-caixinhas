import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ShoppingBasket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — Caixinha do Mercado" },
      { name: "description", content: "Entre com sua conta Google para ver o saldo do mercado da casa." },
      { property: "og:title", content: "Entrar — Caixinha do Mercado" },
      { property: "og:description", content: "Entre com sua conta Google para ver o saldo do mercado da casa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/inicio" });
  },
  component: AuthPage,
});

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth`,
      extraParams: { prompt: "select_account" },
    });
    if (result.error) {
      setLoading(false);
      toast.error("Não foi possível entrar com o Google. Tente de novo.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/inicio", replace: true });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-between px-6 py-10">
      <div className="animate-rise">
        <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-lift">
          <ShoppingBasket className="size-7" />
        </div>
        <h1 className="mt-8 text-5xl font-semibold leading-[1.02]">
          Caixinha
          <br />
          do Mercado
        </h1>
        <p className="mt-4 max-w-xs text-lg text-muted-foreground">
          O dinheiro do mercado da casa, nota por nota.
        </p>
      </div>

      <div className="receipt-paper animate-rise rounded-t-2xl px-6 pt-6" style={{ animationDelay: "80ms" }}>
        <p className="font-num text-xs uppercase tracking-widest text-muted-foreground">Como funciona</p>
        <ol className="mt-3 space-y-2 text-sm">
          <li className="flex gap-3"><span className="font-num text-muted-foreground">01</span>Todo mês começa com o saldo de cada fonte.</li>
          <li className="flex gap-3"><span className="font-num text-muted-foreground">02</span>Leia o QR Code da nota e escolha de quem desconta.</li>
          <li className="flex gap-3"><span className="font-num text-muted-foreground">03</span>Na virada do mês, tudo vira uma caixinha guardada.</li>
        </ol>
        <div className="dashed-rule my-5" />
        <Button variant="ink" size="lg" className="w-full" onClick={signIn} disabled={loading}>
          <span className="flex size-7 items-center justify-center rounded-full bg-card">
            <GoogleMark />
          </span>
          {loading ? "Entrando…" : "Entrar com Google"}
        </Button>
      </div>
    </main>
  );
}
