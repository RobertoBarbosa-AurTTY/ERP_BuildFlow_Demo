import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@/components/ui/skeleton";
import { ShelfLabelView } from "./shelf-label-view";

export const metadata: Metadata = { title: "Placas de prateleira" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ShelfLabelView />
    </Suspense>
  );
}
