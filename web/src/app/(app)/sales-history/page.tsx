import type { Metadata } from "next";
import { SalesHistoryClient } from "./sales-history-client";

export const metadata: Metadata = { title: "Histórico de vendas" };

export default function Page() {
  return <SalesHistoryClient />;
}
