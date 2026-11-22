"use client";

import { useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { delay, MockError } from "@/lib/mock/db";

export type Role = "Admin" | "Gerente" | "Operador";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

// Usuários de demonstração (mesmos do seed do back-end).
const DEMO_USERS: (SessionUser & { password: string })[] = [
  { id: "u1", name: "Administrador Master", email: "admin@buildflow.com.br", password: "admin123", role: "Admin" },
  { id: "u2", name: "Gerente da Loja", email: "gerente@buildflow.com.br", password: "gerente123", role: "Gerente" },
  { id: "u3", name: "Operador de Caixa", email: "caixa@buildflow.com.br", password: "caixa123", role: "Operador" },
];

export const DEMO_LOGIN = { email: DEMO_USERS[0].email, password: DEMO_USERS[0].password };

const SESSION_KEY = "buildflow:session";
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedUser: SessionUser | null = null;

function readSession(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedUser = raw ? (JSON.parse(raw) as SessionUser) : null;
    } catch {
      cachedUser = null;
    }
  }
  return cachedUser;
}

function writeSession(user: SessionUser | null) {
  if (user) window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  else window.localStorage.removeItem(SESSION_KEY);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export async function login(email: string, password: string) {
  const user = DEMO_USERS.find((u) => u.email === email.trim().toLowerCase() && u.password === password);
  if (!user) {
    await delay(null, 500);
    throw new MockError("E-mail ou senha inválidos", 401);
  }
  const { password: _, ...session } = user;
  void _;
  writeSession(session);
  return delay(session, 400);
}

/**
 * Sessão atual. `undefined` enquanto hidrata (servidor/primeiro render),
 * `null` quando não há login.
 */
export function useSession(): SessionUser | null | undefined {
  return useSyncExternalStore(
    subscribe,
    readSession,
    () => undefined,
  );
}

/** Admin sempre tem acesso, como em src/lib/auth.js do back-end. */
export function hasRole(user: SessionUser | null | undefined, roles: Role[]) {
  if (!user) return false;
  return user.role === "Admin" || roles.includes(user.role);
}

export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return () => {
    writeSession(null);
    queryClient.clear();
    router.replace("/login");
  };
}
