import type { Metadata } from "next";
import { ManualClient } from "./manual-client";

export const metadata: Metadata = { title: "Ajuda" };

export default function Page() {
  return <ManualClient />;
}
