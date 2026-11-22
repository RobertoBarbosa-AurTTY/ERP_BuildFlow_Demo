import type { Metadata } from "next";
import { PosClient } from "./pos-client";

export const metadata: Metadata = { title: "PDV / Vendas" };

export default function Page() {
  return <PosClient />;
}
