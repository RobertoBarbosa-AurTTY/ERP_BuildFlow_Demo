// Geração de códigos de barras em SVG, sem dependências externas.
// Suporta Code 128 (subconjuntos B e C) e EAN-13.

// Larguras (barra, espaço, barra...) dos 107 símbolos do Code 128.
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const START_B = 104;
const START_C = 105;
const STOP = 106;

function widthsToModules(widths: string) {
  const modules: boolean[] = [];
  [...widths].forEach((w, i) => {
    for (let k = 0; k < Number(w); k++) modules.push(i % 2 === 0);
  });
  return modules;
}

/** Codifica em Code 128. Usa o subconjunto C para números de tamanho par (mais compacto). */
export function encodeCode128(text: string): boolean[] {
  const clean = [...text].filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126).join("");
  const numeric = /^\d+$/.test(clean) && clean.length >= 4 && clean.length % 2 === 0;
  const values: number[] = [numeric ? START_C : START_B];
  if (numeric) {
    for (let i = 0; i < clean.length; i += 2) values.push(Number(clean.slice(i, i + 2)));
  } else {
    for (const c of clean) values.push(c.charCodeAt(0) - 32);
  }
  const checksum = values.reduce((sum, v, i) => sum + v * (i === 0 ? 1 : i), 0) % 103;
  values.push(checksum, STOP);
  // Zona de silêncio de 10 módulos dos dois lados.
  const quiet = Array<boolean>(10).fill(false);
  return [...quiet, ...values.flatMap((v) => widthsToModules(CODE128_PATTERNS[v])), ...quiet];
}

const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const EAN_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const EAN_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function ean13CheckDigit(first12: string) {
  const sum = [...first12].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

/** Aceita 12 dígitos (calcula o verificador) ou 13 dígitos com verificador válido. */
export function normalizeEan13(value: string): string | null {
  const digits = value.trim();
  if (/^\d{12}$/.test(digits)) return digits + ean13CheckDigit(digits);
  if (/^\d{13}$/.test(digits) && ean13CheckDigit(digits.slice(0, 12)) === Number(digits[12])) return digits;
  return null;
}

/** Módulos do EAN-13 e quais são barras-guia (mais longas). */
export function encodeEan13(code: string): { modules: boolean[]; guards: boolean[] } {
  const parity = EAN_PARITY[Number(code[0])];
  const bits: { bit: string; guard: boolean }[] = [];
  const push = (pattern: string, guard: boolean) => [...pattern].forEach((bit) => bits.push({ bit, guard }));
  push("101", true);
  for (let i = 1; i <= 6; i++) push((parity[i - 1] === "L" ? EAN_L : EAN_G)[Number(code[i])], false);
  push("01010", true);
  for (let i = 7; i <= 12; i++) push(EAN_R[Number(code[i])], false);
  push("101", true);
  return { modules: bits.map((b) => b.bit === "1"), guards: bits.map((b) => b.guard) };
}

export type BarcodeFormat = "auto" | "code128" | "ean13";

interface BarcodeProps {
  value: string;
  format?: BarcodeFormat;
  /** Altura das barras em unidades de módulo. */
  height?: number;
  showText?: boolean;
  className?: string;
}

/** Desenha o código de barras em SVG. Cor vem de `currentColor`. */
export function Barcode({ value, format = "auto", height = 50, showText = true, className }: BarcodeProps) {
  const ean = format === "code128" ? null : normalizeEan13(value);

  if (ean) {
    const { modules, guards } = encodeEan13(ean);
    const left = 11; // espaço para o primeiro dígito
    const width = left + modules.length + 7;
    const textSize = 9;
    const total = height + (showText ? textSize : 5);
    return (
      <svg
        viewBox={`0 0 ${width} ${total}`}
        className={className}
        role="img"
        aria-label={`EAN-13 ${ean}`}
        preserveAspectRatio="xMidYMid meet"
        shapeRendering="crispEdges"
      >
        {modules.map((on, i) =>
          on ? (
            <rect key={i} x={left + i} y={0} width={1} height={guards[i] || !showText ? height + 5 : height} fill="currentColor" />
          ) : null,
        )}
        {showText && (
          <g fill="currentColor" fontFamily="ui-monospace, monospace" fontSize={textSize} textAnchor="middle">
            <text x={left / 2} y={total - 1}>
              {ean[0]}
            </text>
            <text x={left + 3 + 21} y={total - 1} textLength={40} lengthAdjust="spacing">
              {ean.slice(1, 7)}
            </text>
            <text x={left + 50 + 21} y={total - 1} textLength={40} lengthAdjust="spacing">
              {ean.slice(7)}
            </text>
          </g>
        )}
      </svg>
    );
  }

  const modules = encodeCode128(value);
  const textSize = 9;
  const total = height + (showText ? textSize + 3 : 0);
  return (
    <svg
      viewBox={`0 0 ${modules.length} ${total}`}
      className={className}
      role="img"
      aria-label={`Code 128 ${value}`}
      preserveAspectRatio="xMidYMid meet"
      shapeRendering="crispEdges"
    >
      {runs(modules).map(([x, w]) => (
        <rect key={x} x={x} y={0} width={w} height={height} fill="currentColor" />
      ))}
      {showText && (
        <text
          x={modules.length / 2}
          y={total - 1}
          fill="currentColor"
          fontFamily="ui-monospace, monospace"
          fontSize={textSize}
          textAnchor="middle"
        >
          {value}
        </text>
      )}
    </svg>
  );
}

/** Agrupa módulos pretos consecutivos em retângulos [x, largura]. */
function runs(modules: boolean[]) {
  const out: [number, number][] = [];
  let start = -1;
  modules.forEach((on, i) => {
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      out.push([start, i - start]);
      start = -1;
    }
  });
  if (start >= 0) out.push([start, modules.length - start]);
  return out;
}
