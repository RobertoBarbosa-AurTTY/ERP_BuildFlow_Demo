import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/query-state";

export const metadata: Metadata = { title: "Fluxo de caixa" };

export default function Page() {
  return (
    <>
      <PageHeader title="Fluxo de caixa" />
      <EmptyState title="Em construção" description="Esta tela ainda está sendo migrada para o novo front-end." />
    </>
  );
}
