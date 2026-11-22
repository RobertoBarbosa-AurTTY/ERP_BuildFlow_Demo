// Leitura de XML de NF-e (modelo 55) no navegador, via DOMParser.

export interface NfeItem {
  index: number;
  code: string; // cProd
  ean: string; // cEAN (vazio se "SEM GTIN")
  description: string; // xProd
  ncm?: string;
  unit: string; // uCom
  quantity: number; // qCom
  unitPrice: number; // vUnCom
  total: number; // vProd
}

export interface NfeDocument {
  number: string; // nNF
  series?: string;
  issueDate?: string;
  accessKey?: string;
  supplier: { name: string; tradeName?: string; cnpj?: string; city?: string; state?: string };
  totalValue: number;
  items: NfeItem[];
}

function text(parent: Element | Document | null | undefined, tag: string) {
  if (!parent) return "";
  // getElementsByTagNameNS("*") ignora o namespace padrão da NF-e.
  const el = parent.getElementsByTagNameNS("*", tag)[0] ?? parent.getElementsByTagName(tag)[0];
  return el?.textContent?.trim() ?? "";
}

function num(value: string) {
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function parseNfeXml(xml: string): NfeDocument {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Arquivo XML inválido ou corrompido.");
  const infNFe = doc.getElementsByTagNameNS("*", "infNFe")[0];
  if (!infNFe) throw new Error("O arquivo não parece ser uma NF-e (tag infNFe não encontrada).");

  const ide = infNFe.getElementsByTagNameNS("*", "ide")[0];
  const emit = infNFe.getElementsByTagNameNS("*", "emit")[0];
  const dets = Array.from(infNFe.getElementsByTagNameNS("*", "det"));
  if (!dets.length) throw new Error("Nenhum item (det) encontrado na nota.");

  const items: NfeItem[] = dets.map((det, i) => {
    const prod = det.getElementsByTagNameNS("*", "prod")[0];
    const ean = text(prod, "cEAN");
    const quantity = num(text(prod, "qCom"));
    const unitPrice = num(text(prod, "vUnCom"));
    return {
      index: Number(det.getAttribute("nItem")) || i + 1,
      code: text(prod, "cProd"),
      ean: /^\d{8,14}$/.test(ean) ? ean : "",
      description: text(prod, "xProd").replace(/\s+/g, " "),
      ncm: text(prod, "NCM") || undefined,
      unit: text(prod, "uCom") || "UN",
      quantity,
      unitPrice,
      total: num(text(prod, "vProd")) || quantity * unitPrice,
    };
  });

  const id = infNFe.getAttribute("Id") ?? "";
  return {
    number: text(ide, "nNF"),
    series: text(ide, "serie") || undefined,
    issueDate: text(ide, "dhEmi") || text(ide, "dEmi") || undefined,
    accessKey: id.replace(/^NFe/, "") || undefined,
    supplier: {
      name: text(emit, "xNome"),
      tradeName: text(emit, "xFant") || undefined,
      cnpj: text(emit, "CNPJ") || text(emit, "CPF") || undefined,
      city: text(emit, "xMun") || undefined,
      state: text(emit, "UF") || undefined,
    },
    totalValue: num(text(infNFe.getElementsByTagNameNS("*", "ICMSTot")[0], "vNF")) || items.reduce((s, i) => s + i.total, 0),
    items,
  };
}

/** NF-e fictícia para demonstração: 2 itens já cadastrados e 3 novos. */
export const SAMPLE_NFE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe27251184429695000111550010000587231000587236" versao="4.00">
      <ide>
        <cUF>27</cUF><natOp>VENDA DE MERCADORIA</natOp><mod>55</mod><serie>1</serie><nNF>58723</nNF>
        <dhEmi>2026-11-18T09:42:00-03:00</dhEmi><tpNF>1</tpNF>
      </ide>
      <emit>
        <CNPJ>84429695000111</CNPJ>
        <xNome>TIGRE S.A. TUBOS E CONEXOES</xNome>
        <xFant>Tigre</xFant>
        <enderEmit><xLgr>Rua Xavantes</xLgr><nro>54</nro><xMun>Joinville</xMun><UF>SC</UF></enderEmit>
      </emit>
      <dest><CNPJ>11222333000181</CNPJ><xNome>BUILDFLOW MATERIAIS DE CONSTRUCAO LTDA</xNome></dest>
      <det nItem="1">
        <prod>
          <cProd>10010050</cProd><cEAN>7891234567894</cEAN><xProd>TUBO PVC ESGOTO 100MM 6M</xProd><NCM>39172300</NCM>
          <CFOP>6102</CFOP><uCom>UN</uCom><qCom>30.0000</qCom><vUnCom>58.9000</vUnCom><vProd>1767.00</vProd>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <cProd>CON-001</cProd><cEAN>SEM GTIN</cEAN><xProd>JOELHO 90 SOLDAVEL 1/2 PVC</xProd><NCM>39174090</NCM>
          <CFOP>6102</CFOP><uCom>UN</uCom><qCom>200.0000</qCom><vUnCom>1.4500</vUnCom><vProd>290.00</vProd>
        </prod>
      </det>
      <det nItem="3">
        <prod>
          <cProd>22150025</cProd><cEAN>7891960812345</cEAN><xProd>REGISTRO ESFERA SOLDAVEL 25MM</xProd><NCM>84818095</NCM>
          <CFOP>6102</CFOP><uCom>PC</uCom><qCom>24.0000</qCom><vUnCom>18.7500</vUnCom><vProd>450.00</vProd>
        </prod>
      </det>
      <det nItem="4">
        <prod>
          <cProd>30440040</cProd><cEAN>7891960845671</cEAN><xProd>CAIXA SIFONADA 150X150X50 BRANCA</xProd><NCM>39229000</NCM>
          <CFOP>6102</CFOP><uCom>UN</uCom><qCom>40.0000</qCom><vUnCom>22.3000</vUnCom><vProd>892.00</vProd>
        </prod>
      </det>
      <det nItem="5">
        <prod>
          <cProd>51220011</cProd><cEAN>SEM GTIN</cEAN><xProd>ADESIVO PLASTICO PARA PVC 175G</xProd><NCM>35069110</NCM>
          <CFOP>6102</CFOP><uCom>UN</uCom><qCom>48.0000</qCom><vUnCom>9.8000</vUnCom><vProd>470.40</vProd>
        </prod>
      </det>
      <total><ICMSTot><vProd>3869.40</vProd><vNF>3869.40</vNF></ICMSTot></total>
    </infNFe>
  </NFe>
</nfeProc>`;
