import { AuthGate } from "@/components/layout/auth-gate";
import { PosTopbar } from "@/components/layout/pos-topbar";

// O PDV é uma tela independente (sem menu lateral), em tela cheia,
// como no sistema antigo: foco total na frente de caixa.
export default function PosLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGate>
      <div className="flex min-h-svh flex-col bg-background">
        <PosTopbar />
        <main className="flex flex-1 flex-col p-4 md:p-6">{children}</main>
      </div>
    </AuthGate>
  );
}
