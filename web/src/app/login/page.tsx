import type { Metadata } from "next";
import { Suspense } from "react";
import { Boxes, ChartLine, Layers, ShoppingCart } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

const HIGHLIGHTS = [
  { icon: ShoppingCart, title: "PDV ágil", text: "Frente de caixa com atalhos, descontos e baixa automática de estoque." },
  { icon: Boxes, title: "Estoque endereçado", text: "SKUs, validade, mínimos e endereçamento de armazém." },
  { icon: ChartLine, title: "Financeiro completo", text: "Contas a pagar e receber, fluxo de caixa e DRE." },
];

export default function LoginPage() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex items-center gap-2 font-semibold">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Layers className="size-4" />
          </div>
          BuildFlow
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <Suspense>
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </div>

      <div className="relative hidden overflow-hidden bg-primary lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_20%,white_0,transparent_40%),radial-gradient(circle_at_80%_70%,white_0,transparent_35%)]"
        />
        <div className="relative max-w-md space-y-3 text-primary-foreground">
          <p className="text-sm font-medium uppercase tracking-widest opacity-80">ERP para o varejo</p>
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">
            Estoque, vendas e financeiro no mesmo fluxo.
          </h2>
        </div>
        <ul className="relative grid gap-4">
          {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
            <li
              key={title}
              className="flex gap-4 rounded-xl border border-white/15 bg-white/10 p-4 text-primary-foreground backdrop-blur"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/15">
                <Icon className="size-5" />
              </div>
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-sm opacity-80">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
