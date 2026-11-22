import type { Metadata } from "next";
import { StockView } from "./stock-view";

export const metadata: Metadata = { title: "Estoque" };

export default function Page() {
  return <StockView />;
}
