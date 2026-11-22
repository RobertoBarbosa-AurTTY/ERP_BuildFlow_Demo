"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { getReceiptSettings, listPosProducts, listSaleCustomers } from "@/lib/services/sales";
import { getOpenSession } from "@/lib/services/cash";

export const posKeys = {
  products: ["sales", "pos-products"] as const,
  customers: ["sales", "customers"] as const,
  settings: ["sales", "receipt-settings"] as const,
  openCash: ["cash", "open"] as const,
};

export function usePosProducts() {
  return useQuery({ queryKey: posKeys.products, queryFn: listPosProducts });
}

export function useSaleCustomers() {
  return useQuery({ queryKey: posKeys.customers, queryFn: listSaleCustomers, staleTime: 5 * 60_000 });
}

export function useReceiptSettings() {
  return useQuery({ queryKey: posKeys.settings, queryFn: getReceiptSettings, staleTime: 5 * 60_000 });
}

export function useOpenCashSession() {
  return useQuery({ queryKey: posKeys.openCash, queryFn: getOpenSession });
}

/** Tudo que uma venda/cancelamento altera: vendas, caixa, estoque e contas a receber. */
export function invalidateAfterSale(queryClient: QueryClient) {
  for (const key of ["sales", "cash", "products", "stock", "stock-movements", "receivables", "dashboard"]) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}
