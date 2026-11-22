import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@/components/ui/skeleton";
import { PriceTagView } from "./price-tag-view";

export const metadata: Metadata = { title: "Etiquetas de preço" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <PriceTagView />
    </Suspense>
  );
}
