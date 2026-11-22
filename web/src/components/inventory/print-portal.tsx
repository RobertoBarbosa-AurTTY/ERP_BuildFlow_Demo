"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const subscribe = () => () => {};

/**
 * Renderiza o conteúdo direto no <body>, visível apenas na impressão.
 * Durante a impressão todo o resto da página é ocultado.
 */
export function PrintPortal({ children, pageMargin = "6mm" }: { children: React.ReactNode; pageMargin?: string }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  if (!mounted) return null;
  return createPortal(
    <div className="label-print-root hidden print:block">
      <style>{`@media print {
  @page { margin: ${pageMargin}; }
  html, body { background: #fff !important; }
  body > *:not(.label-print-root) { display: none !important; }
  .label-print-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`}</style>
      {children}
    </div>,
    document.body,
  );
}
