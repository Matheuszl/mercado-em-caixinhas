import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildRsQueryUrl, parseNfceHtml, type ParsedNfce } from "./nfce-parse";

export type FetchNfceResult =
  | { ok: true; data: ParsedNfce; sourceUrl: string }
  | { ok: false; error: string };

/** Looks up an NFC-e on the Rio Grande do Sul public portal and returns its items and total. */
export const fetchNfce = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url: string }) => {
    if (!input || typeof input.url !== "string" || input.url.length > 2000) {
      throw new Error("Link inválido");
    }
    return { url: input.url };
  })
  .handler(async ({ data }): Promise<FetchNfceResult> => {
    const built = buildRsQueryUrl(data.url);
    if (!built.ok) return built;

    let html: string;
    try {
      const res = await fetch(built.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        return { ok: false, error: `A Sefaz não respondeu agora (erro ${res.status}). Tente de novo em instantes.` };
      }
      html = await res.text();
    } catch (err) {
      console.error("nfce fetch failed", err);
      return { ok: false, error: "Não consegui falar com a Sefaz agora. Tente de novo ou lance manualmente." };
    }

    const parsed = parseNfceHtml(html);
    if (!parsed.ok) return parsed;

    return {
      ok: true,
      data: { ...parsed.data, accessKey: parsed.data.accessKey ?? built.accessKey },
      sourceUrl: built.url,
    };
  });
