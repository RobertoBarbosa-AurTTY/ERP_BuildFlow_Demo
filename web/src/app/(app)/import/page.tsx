import type { Metadata } from "next";
import { ImportView } from "./import-view";

export const metadata: Metadata = { title: "Importar NF-e" };

export default function Page() {
  return <ImportView />;
}
