import { describe, expect, it } from "vitest";
import { buildRsQueryUrl, parseNfceHtml } from "./nfce-parse";

const KEY = "43261012345678000190651010000123451000123456";

const SAMPLE = `
<div id="conteudo">
  <div class="txtCenter">
    <div id="u20" class="txtTopo">SUPERMERCADO EXEMPLO LTDA</div>
    <div class="text">CNPJ: 12.345.678/0001-90</div>
    <div class="text">RUA DAS FLORES, 100, , CENTRO, PORTO ALEGRE, RS</div>
  </div>
  <table id="tabResult">
    <tr id="Item + 1">
      <td valign="top"><span class="txtTit">ARROZ TIPO 1 5KG</span><span class="RCod">(Código: 7891234 )</span><br>
        <span class="Rqtd"><strong>Qtde.:</strong>2</span><span class="RUN"><strong>UN: </strong>UN</span>
        <span class="RvlUnit"><strong>Vl. Unit.:</strong>&nbsp;24,90</span></td>
      <td align="right" valign="top" class="txtTit noWrap">Vl. Total<br><span class="valor">49,80</span></td>
    </tr>
    <tr id="Item + 2">
      <td valign="top"><span class="txtTit">BANANA PRATA KG</span><span class="RCod">(Código: 55 )</span><br>
        <span class="Rqtd"><strong>Qtde.:</strong>1,235</span><span class="RUN"><strong>UN: </strong>KG</span>
        <span class="RvlUnit"><strong>Vl. Unit.:</strong>&nbsp;6,99</span></td>
      <td align="right" valign="top" class="txtTit noWrap">Vl. Total<br><span class="valor">8,63</span></td>
    </tr>
  </table>
  <div id="totalNota" class="txtRight">
    <div id="linhaTotal"><label>Qtd. total de itens:</label><span class="totalNumb">2</span></div>
    <div id="linhaTotal"><label>Valor total R$:</label><span class="totalNumb">58,43</span></div>
    <div id="linhaTotal"><label>Descontos R$:</label><span class="totalNumb">1,00</span></div>
    <div id="linhaTotal" class="linhaShade"><label>Valor a pagar R$:</label><span class="totalNumb txtMax">57,43</span></div>
  </div>
</div>
<div id="infos">
  <li><strong>Número: </strong>12345 <strong> Série: </strong>101 <strong> Emissão: </strong>28/10/2026 18:42:10-03:00 - Via Consumidor</li>
  <span class="chave">4326 1012 3456 7800 0190 6510 1000 0123 4510 0012 3456</span>
</div>`;

describe("parseNfceHtml", () => {
  it("reads store, items, amount paid and emission date", () => {
    const res = parseNfceHtml(SAMPLE);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.storeName).toBe("SUPERMERCADO EXEMPLO LTDA");
    expect(res.data.storeCnpj).toBe("12.345.678/0001-90");
    expect(res.data.total).toBe(57.43);
    expect(res.data.items).toHaveLength(2);
    expect(res.data.items[1]).toMatchObject({ description: "BANANA PRATA KG", quantity: 1.235, unit: "KG", unit_price: 6.99, total_price: 8.63 });
    expect(res.data.issuedAt).toBe("2026-10-28T18:42:10-03:00");
    expect(res.data.accessKey).toBe(KEY);
  });

  it("returns the Sefaz error message", () => {
    const res = parseNfceHtml(`<div class='alert alert-danger text-center'>201 - Dígito verificador inválido.</div>`);
    expect(res).toEqual({ ok: false, error: "A Sefaz respondeu: 201 - Dígito verificador inválido." });
  });
});

describe("buildRsQueryUrl", () => {
  it("accepts the RS QR code link", () => {
    const res = buildRsQueryUrl(`https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=${KEY}|2|1|1|ABCDEF`);
    expect(res).toEqual({ ok: true, accessKey: KEY, url: `https://dfe-portal.svrs.rs.gov.br/Dfe/QrCodeNFce?p=${KEY}|2|1|1|ABCDEF` });
  });

  it("rejects receipts from other states", () => {
    const res = buildRsQueryUrl(`https://www.nfce.fazenda.sp.gov.br/qrcode?p=35${KEY.slice(2)}|2|1|1|AB`);
    expect(res.ok).toBe(false);
  });
});
