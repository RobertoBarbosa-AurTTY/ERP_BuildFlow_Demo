import type { Metadata } from "next";
import { NewAddressView } from "./new-address-view";

export const metadata: Metadata = { title: "Endereços do depósito" };

export default function Page() {
  return <NewAddressView />;
}
