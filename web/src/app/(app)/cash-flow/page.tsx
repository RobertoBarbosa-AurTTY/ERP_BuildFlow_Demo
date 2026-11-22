import type { Metadata } from "next";
import { CashFlowView } from "./cash-flow-view";

export const metadata: Metadata = { title: "Fluxo de caixa" };

export default function Page() {
  return <CashFlowView />;
}
