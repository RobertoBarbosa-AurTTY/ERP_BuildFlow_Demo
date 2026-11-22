import {
  BadgeDollarSign,
  BookOpen,
  Boxes,
  ChartLine,
  ChartPie,
  FileDown,
  FileSearch,
  HandCoins,
  History,
  ReceiptText,
  Settings,
  ShoppingCart,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/auth";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Operação",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: ChartPie },
      { href: "/pos", label: "PDV / Vendas", icon: ShoppingCart },
      { href: "/stock", label: "Estoque", icon: Boxes },
      { href: "/receiving", label: "Entradas", icon: FileDown },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { href: "/bills", label: "Contas a pagar", icon: ReceiptText },
      { href: "/receivables", label: "Contas a receber", icon: HandCoins },
      { href: "/cash-flow", label: "Fluxo de caixa", icon: TrendingUp },
      { href: "/cash-audit", label: "Auditoria de caixa", icon: FileSearch, roles: ["Gerente"] },
    ],
  },
  {
    title: "Análises",
    items: [
      { href: "/reports", label: "Relatórios", icon: ChartLine },
      { href: "/sales-history", label: "Histórico de vendas", icon: History },
      { href: "/customers", label: "Clientes", icon: Users },
    ],
  },
  {
    title: "Sistema",
    items: [
      { href: "/settings", label: "Configurações", icon: Settings },
      { href: "/manual", label: "Ajuda", icon: BookOpen },
    ],
  },
];

/** Rotas internas que não aparecem no menu, para breadcrumb/título. */
export const EXTRA_ROUTES: Record<string, string> = {
  "/import": "Importação de fornecedor",
  "/address": "Endereçar produto",
  "/new-address": "Criar endereço",
  "/price-tag": "Etiqueta de preço",
  "/shelf-label": "Etiqueta de prateleira",
};

export function titleFor(pathname: string) {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((i) => pathname.startsWith(i.href));
    if (item) return { group: group.title, label: item.label };
  }
  const extra = Object.entries(EXTRA_ROUTES).find(([href]) => pathname.startsWith(href));
  return extra ? { group: "Operação", label: extra[1] } : { group: "", label: "BuildFlow" };
}

export const BrandIcon = BadgeDollarSign;
