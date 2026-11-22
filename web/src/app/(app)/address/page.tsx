import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@/components/ui/skeleton";
import { AddressView } from "./address-view";

export const metadata: Metadata = { title: "Endereçar produtos" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <AddressView />
    </Suspense>
  );
}
