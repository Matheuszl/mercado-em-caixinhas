import { parse, type HTMLElement } from "node-html-parser";
import { parseBRNumber } from "./money";

export type ParsedNfceItem = {
  description: string;
  code: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total_price: number;
};

export type ParsedNfce = {
  accessKey: string | null;
  storeName: string;
  storeCnpj: string | null;
  storeAddress: string | null;
  issuedAt: string | null;
  total: number;
  items: ParsedNfceItem[];
};

export type ParseResult = { ok: true; data: ParsedNfce } | { ok: false; error: string };

/** The Rio Grande do Sul public NFC-e page (SVRS) rendered from a QR code. */
export const RS_NFCE_ENDPOINT = "https://dfe-portal.svrs.rs.gov.br/Dfe/QrCodeNFce";

const clean = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();
const afterColon = (s: string) => {
  const i = s.lastIndexOf(":");
  return clean(i >= 0 ? s.slice(i + 1) : s);
};

/**
 * Builds the SVRS query URL from whatever the user scanned or pasted:
 * - the QR code link (…?p=CHAVE|2|1|1|HASH), from sefaz.rs.gov.br or svrs.rs.gov.br
 * - an older QR code link (…?chNFe=…&nVersao=100…)
 * - just the "p" value (CHAVE|2|1|1|HASH)
 */
export function buildRsQueryUrl(input: string): { ok: true; url: string; accessKey: string } | { ok: false; error: string } {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Cole o link do QR Code da nota." };

  let pValue: string | null = null;
  let legacyQuery: string | null = null;

  if (/^\d{44}\|/.test(raw)) {
    pValue = raw;
  } else {
    let url: URL;
    try {
      url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    } catch {
      return { ok: false, error: "Isso não parece um link de nota fiscal." };
    }
    const host = url.hostname.toLowerCase();
    if (!host.endsWith(".rs.gov.br")) {
      return { ok: false, error: "Por enquanto o app só lê notas do Rio Grande do Sul." };
    }
    // Pipes may arrive raw or encoded; URLSearchParams decodes both.
    pValue = url.searchParams.get("p");
    if (!pValue && url.searchParams.get("chNFe")) legacyQuery = url.search.slice(1);
  }

  if (pValue) {
    const key = pValue.split("|")[0]?.replace(/\D/g, "") ?? "";
    if (key.length !== 44) return { ok: false, error: "A chave de acesso da nota está incompleta." };
    if (!key.startsWith("43")) return { ok: false, error: "Essa nota não é do Rio Grande do Sul." };
    return { ok: true, url: `${RS_NFCE_ENDPOINT}?p=${pValue}`, accessKey: key };
  }
  if (legacyQuery) {
    const key = new URLSearchParams(legacyQuery).get("chNFe")?.replace(/\D/g, "") ?? "";
    if (key.length !== 44) return { ok: false, error: "A chave de acesso da nota está incompleta." };
    return { ok: true, url: `${RS_NFCE_ENDPOINT}?${legacyQuery}`, accessKey: key };
  }
  return { ok: false, error: "Não encontrei os dados da nota nesse link." };
}

function parseIssuedAt(text: string): string | null {
  const m = text.match(/Emiss[ãa]o:?\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/i);
  if (!m) return null;
  const [, d, mo, y, h, mi, s] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s ?? "00"}-03:00`;
}

function findTotal(root: HTMLElement, items: ParsedNfceItem[]): number {
  const lines = root.querySelectorAll("#totalNota div");
  const byLabel = (re: RegExp) => {
    for (const line of lines) {
      const label = clean(line.querySelector("label")?.text);
      if (re.test(label)) {
        const n = parseBRNumber(line.querySelector(".totalNumb")?.text);
        if (n != null) return n;
      }
    }
    return null;
  };
  const toPay = byLabel(/valor a pagar/i);
  if (toPay != null) return toPay;
  const big = parseBRNumber(root.querySelector(".totalNumb.txtMax")?.text);
  if (big != null) return big;
  const total = byLabel(/valor total/i);
  if (total != null) return total;
  return Math.round(items.reduce((acc, i) => acc + i.total_price, 0) * 100) / 100;
}

/** Parses the HTML of the national NFC-e consultation layout used by SVRS (RS). */
export function parseNfceHtml(html: string): ParseResult {
  const root = parse(html);

  const alert = clean(root.querySelector(".alert-danger")?.text);
  if (alert) return { ok: false, error: `A Sefaz respondeu: ${alert}` };

  const items: ParsedNfceItem[] = [];
  for (const row of root.querySelectorAll("#tabResult tr")) {
    const description = clean(row.querySelector("span.txtTit")?.text);
    if (!description) continue;
    const total = parseBRNumber(row.querySelector(".valor")?.text);
    const codeText = clean(row.querySelector(".RCod")?.text);
    const code = codeText.match(/(\d[\d.-]*)/)?.[1] ?? null;
    const qtyText = row.querySelector(".Rqtd")?.text;
    const unitText = row.querySelector(".RUN")?.text;
    const unitPriceText = row.querySelector(".RvlUnit")?.text;
    const quantity = qtyText ? parseBRNumber(afterColon(qtyText)) : null;
    const unit_price = unitPriceText ? parseBRNumber(afterColon(unitPriceText)) : null;
    items.push({
      description,
      code,
      quantity,
      unit: unitText ? afterColon(unitText) || null : null,
      unit_price,
      total_price: total ?? (quantity != null && unit_price != null ? Math.round(quantity * unit_price * 100) / 100 : 0),
    });
  }

  const total = findTotal(root, items);
  if (items.length === 0 && !total) {
    return { ok: false, error: "Não consegui ler os itens dessa nota. Tente de novo ou lance manualmente." };
  }

  const storeName = clean(root.querySelector("#u20")?.text) || clean(root.querySelector(".txtTopo")?.text) || "Mercado";
  let textEls = root.querySelectorAll(".txtCenter .text");
  if (textEls.length === 0) textEls = root.querySelectorAll("div.text");
  const textBlocks = textEls.map((el) => clean(el.text));
  const cnpjBlock = textBlocks.find((t) => /CNPJ/i.test(t)) ?? null;
  const storeCnpj = cnpjBlock?.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/)?.[1] ?? null;
  const rawAddress = textBlocks.find((t) => t && !/CNPJ/i.test(t)) ?? null;
  const storeAddress = rawAddress ? rawAddress.replace(/\s+,/g, ",").replace(/,(\s*,)+/g, ",").trim() : null;

  const keyDigits = clean(root.querySelector(".chave")?.text).replace(/\D/g, "");
  const accessKey = keyDigits.length === 44 ? keyDigits : null;

  const issuedAt = parseIssuedAt(clean(root.querySelector("#infos")?.text) || clean(root.text));

  return {
    ok: true,
    data: { accessKey, storeName, storeCnpj, storeAddress, issuedAt, total, items },
  };
}
