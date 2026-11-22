import type { Metadata } from "next";
import { CashAuditClient } from "./cash-audit-client";

export const metadata: Metadata = { title: "Auditoria de caixa" };

export default function Page() {
  return <CashAuditClient />;
}
