import { createFileRoute, redirect } from "@tanstack/react-router";

// The home of the app is the current month, behind sign-in.
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Caixinha do Mercado — o mês na palma da mão" },
      { name: "description", content: "Saldo do mercado do mês, notas fiscais lidas pelo QR Code e caixinhas dos meses anteriores." },
      { property: "og:title", content: "Caixinha do Mercado" },
      { property: "og:description", content: "Saldo do mercado do mês, notas fiscais lidas pelo QR Code e caixinhas dos meses anteriores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/inicio" });
  },
});
