// Etiquetas físicas (gôndola e placa de prateleira). As cores aqui representam o
// papel impresso, por isso não seguem o tema claro/escuro da interface.
import type { Product, WarehouseLocation } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { Barcode, type BarcodeFormat } from "./barcode";

// ---------------------------------------------------------------------------
// Etiqueta de preço

export type PriceLabelSize = "small" | "gondola" | "large";
export type PriceLabelColor = "white" | "yellow" | "red";
export type BarcodeSource = "barcode" | "sku" | "none";

export const PRICE_LABEL_SIZES: Record<
  PriceLabelSize,
  { label: string; w: number; h: number; name: number; price: number; meta: number; barcode: number }
> = {
  small: { label: "Pequena · 50 × 30 mm", w: 50, h: 30, name: 2.6, price: 7, meta: 1.8, barcode: 6 },
  gondola: { label: "Gôndola · 60 × 40 mm", w: 60, h: 40, name: 3, price: 9, meta: 2, barcode: 8 },
  large: { label: "Grande · 100 × 60 mm", w: 100, h: 60, name: 4.6, price: 15, meta: 2.8, barcode: 11 },
};

export const PRICE_LABEL_COLORS: Record<PriceLabelColor, { label: string; className: string; accent: string }> = {
  white: { label: "Branca (padrão)", className: "bg-white text-neutral-900 border-neutral-300", accent: "text-neutral-500" },
  yellow: { label: "Amarela (promoção)", className: "bg-yellow-300 text-neutral-950 border-yellow-500", accent: "text-neutral-700" },
  red: { label: "Vermelha (oferta)", className: "bg-red-600 text-white border-red-700", accent: "text-red-100" },
};

export interface PriceLabelOptions {
  size: PriceLabelSize;
  color: PriceLabelColor;
  barcodeSource: BarcodeSource;
  barcodeFormat: BarcodeFormat;
  showStore: boolean;
  showSku: boolean;
  showUnit: boolean;
}

const priceFormat = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function barcodeValue(product: Pick<Product, "barcode" | "sku">, source: BarcodeSource) {
  if (source === "none") return "";
  if (source === "sku") return product.sku;
  return product.barcode || product.sku;
}

export function PriceLabel({
  product,
  options,
  storeName,
}: {
  product: Pick<Product, "name" | "sku" | "barcode" | "price" | "unit">;
  options: PriceLabelOptions;
  storeName: string;
}) {
  const size = PRICE_LABEL_SIZES[options.size];
  const color = PRICE_LABEL_COLORS[options.color];
  const code = barcodeValue(product, options.barcodeSource);
  const [int, cents] = priceFormat.format(product.price).split(",");
  const mm = (v: number) => `${v}mm`;
  return (
    <div
      className={cn("flex shrink-0 flex-col overflow-hidden rounded-[1.5mm] border font-sans leading-tight", color.className)}
      style={{ width: mm(size.w), height: mm(size.h), padding: mm(size.w * 0.04), breakInside: "avoid" }}
    >
      {(options.showStore || options.showSku) && (
        <div className={cn("flex items-center justify-between gap-[1mm] font-semibold uppercase", color.accent)} style={{ fontSize: mm(size.meta) }}>
          <span className="truncate">{options.showStore ? storeName : ""}</span>
          {options.showSku && <span className="shrink-0 font-mono">{product.sku}</span>}
        </div>
      )}
      <p className="line-clamp-2 font-semibold uppercase" style={{ fontSize: mm(size.name), marginTop: mm(0.6) }}>
        {product.name}
      </p>
      <div className="mt-auto flex items-end justify-between gap-[1mm]">
        <div className="flex items-start font-bold tracking-tight" style={{ lineHeight: 0.9 }}>
          <span style={{ fontSize: mm(size.price * 0.32), marginTop: mm(size.price * 0.08), marginRight: mm(0.6) }}>R$</span>
          <span className="tabular" style={{ fontSize: mm(size.price) }}>
            {int}
          </span>
          <span className="tabular" style={{ fontSize: mm(size.price * 0.45), marginTop: mm(size.price * 0.05) }}>
            ,{cents}
          </span>
          {options.showUnit && (
            <span className={cn("self-end font-medium", color.accent)} style={{ fontSize: mm(size.meta), marginLeft: mm(0.6) }}>
              /{product.unit}
            </span>
          )}
        </div>
      </div>
      {code && (
        <div
          className={cn("mt-[0.8mm] rounded-[0.6mm] bg-white px-[1mm] text-black")}
          style={{ height: mm(size.barcode), width: "100%" }}
        >
          <Barcode value={code} format={options.barcodeFormat} height={40} className="h-full w-full" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Placa de prateleira (endereço)

export type ShelfLabelSize = "compact" | "standard" | "large";
export type ShelfLabelColor = "yellow" | "white" | "blue";

export const SHELF_LABEL_SIZES: Record<ShelfLabelSize, { label: string; w: number; h: number; value: number; caption: number; barcode: number }> = {
  compact: { label: "Compacta · 70 × 35 mm", w: 70, h: 35, value: 7, caption: 1.8, barcode: 7 },
  standard: { label: "Padrão · 100 × 50 mm", w: 100, h: 50, value: 11, caption: 2.4, barcode: 10 },
  large: { label: "Grande · 150 × 75 mm", w: 150, h: 75, value: 17, caption: 3.4, barcode: 15 },
};

export const SHELF_LABEL_COLORS: Record<ShelfLabelColor, { label: string; className: string; cell: string }> = {
  yellow: { label: "Amarela (alta visibilidade)", className: "bg-yellow-300 text-neutral-950 border-neutral-900", cell: "border-neutral-900/70" },
  white: { label: "Branca", className: "bg-white text-neutral-950 border-neutral-900", cell: "border-neutral-900/50" },
  blue: { label: "Azul (setor frio)", className: "bg-blue-700 text-white border-blue-950", cell: "border-white/50" },
};

export interface ShelfLabelData extends WarehouseLocation {
  code: string;
  description?: string;
}

export function ShelfLabel({
  data,
  size: sizeKey,
  color: colorKey,
  showBarcode,
}: {
  data: ShelfLabelData;
  size: ShelfLabelSize;
  color: ShelfLabelColor;
  showBarcode: boolean;
}) {
  const size = SHELF_LABEL_SIZES[sizeKey];
  const color = SHELF_LABEL_COLORS[colorKey];
  const mm = (v: number) => `${v}mm`;
  const parts: [string, string][] = [
    ["Corredor", data.aisle],
    ["Prateleira", data.shelf],
    ["Nível", data.level],
    ["Posição", data.slot],
  ];
  return (
    <div
      className={cn("flex shrink-0 flex-col overflow-hidden rounded-[1.5mm] border-[0.6mm] font-sans", color.className)}
      style={{ width: mm(size.w), height: mm(size.h), padding: mm(size.w * 0.03), breakInside: "avoid" }}
    >
      <div className="flex items-center justify-between gap-[1mm] font-bold uppercase" style={{ fontSize: mm(size.caption) }}>
        <span className="truncate">{data.deposit}</span>
        {data.description && <span className="truncate font-medium opacity-80">{data.description}</span>}
      </div>
      <div className="mt-[1mm] grid flex-1 grid-cols-4 gap-[1mm]">
        {parts.map(([label, value]) => (
          <div key={label} className={cn("flex flex-col items-center justify-center rounded-[1mm] border-[0.4mm]", color.cell)}>
            <span className="font-semibold uppercase opacity-80" style={{ fontSize: mm(size.caption * 0.85) }}>
              {label}
            </span>
            <span className="font-black tabular leading-none" style={{ fontSize: mm(size.value) }}>
              {value || "—"}
            </span>
          </div>
        ))}
      </div>
      {showBarcode && (
        <div className="mt-[1mm] rounded-[0.6mm] bg-white px-[2mm] text-black" style={{ height: mm(size.barcode) }}>
          <Barcode value={data.code} format="code128" height={40} className="h-full w-full" />
        </div>
      )}
    </div>
  );
}
