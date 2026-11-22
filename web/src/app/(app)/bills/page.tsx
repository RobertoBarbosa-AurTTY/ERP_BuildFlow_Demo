import type { Metadata } from "next";
import { BillsClient } from "./bills-client";

export const metadata: Metadata = { title: "Contas a pagar" };

export default function Page() {
  return <BillsClient />;
}
