"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getLabelSettings,
  getStockStats,
  listAddresses,
  listCategories,
  listProducts,
  listReceivings,
  listStockMovements,
  type ListMovementsParams,
  type ListProductsParams,
} from "@/lib/services/products";

export const inventoryKeys = {
  products: (params: ListProductsParams = {}) => ["products", "list", params] as const,
  stats: ["products", "stats"] as const,
  labelSettings: ["products", "label-settings"] as const,
  categories: ["categories"] as const,
  movements: (params: ListMovementsParams = {}) => ["stock-movements", params] as const,
  receivings: ["stock-movements", "receivings"] as const,
  addresses: ["warehouse-addresses"] as const,
};

export function useProducts(params: ListProductsParams = {}) {
  return useQuery({ queryKey: inventoryKeys.products(params), queryFn: () => listProducts(params) });
}

export function useStockStats() {
  return useQuery({ queryKey: inventoryKeys.stats, queryFn: () => getStockStats() });
}

export function useCategories() {
  return useQuery({ queryKey: inventoryKeys.categories, queryFn: listCategories, staleTime: 5 * 60_000 });
}

export function useStockMovements(params: ListMovementsParams = {}, enabled = true) {
  return useQuery({ queryKey: inventoryKeys.movements(params), queryFn: () => listStockMovements(params), enabled });
}

export function useReceivings() {
  return useQuery({ queryKey: inventoryKeys.receivings, queryFn: () => listReceivings() });
}

export function useAddresses() {
  return useQuery({ queryKey: inventoryKeys.addresses, queryFn: listAddresses });
}

export function useLabelSettings() {
  return useQuery({ queryKey: inventoryKeys.labelSettings, queryFn: getLabelSettings, staleTime: 5 * 60_000 });
}

/** Invalida tudo que depende de saldo/cadastro de produtos. */
export function useInvalidateInventory() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["products"] }),
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] }),
      queryClient.invalidateQueries({ queryKey: ["warehouse-addresses"] }),
      queryClient.invalidateQueries({ queryKey: ["categories"] }),
    ]);
}
