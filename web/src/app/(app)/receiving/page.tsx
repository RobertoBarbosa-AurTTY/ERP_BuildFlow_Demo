import type { Metadata } from "next";
import { ReceivingView } from "./receiving-view";

export const metadata: Metadata = { title: "Entradas de mercadoria" };

export default function Page() {
  return <ReceivingView />;
}
