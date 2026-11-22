"use client";

import { Check, Info, Minus, ShieldCheck } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession, type Role } from "@/lib/auth";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

// Usuários de demonstração (espelham src/lib/auth.ts, sem as senhas).
const USERS: { id: string; name: string; email: string; role: Role }[] = [
  { id: "u1", name: "Administrador Master", email: "admin@buildflow.com.br", role: "Admin" },
  { id: "u2", name: "Gerente da Loja", email: "gerente@buildflow.com.br", role: "Gerente" },
  { id: "u3", name: "Operador de Caixa", email: "caixa@buildflow.com.br", role: "Operador" },
];

const ROLE_INFO: Record<Role, { tone: StatusTone; summary: string }> = {
  Admin: { tone: "info", summary: "Acesso total, incluindo dados da empresa e exclusões." },
  Gerente: { tone: "success", summary: "Gestão da loja: financeiro, estoque, clientes e auditoria." },
  Operador: { tone: "neutral", summary: "Operação de caixa: vendas, consultas e estoque." },
};

const ROLES: Role[] = ["Admin", "Gerente", "Operador"];

const PERMISSIONS: { area: string; roles: Role[] }[] = [
  { area: "PDV, vendas e orçamentos", roles: ["Admin", "Gerente", "Operador"] },
  { area: "Consultar estoque e histórico de vendas", roles: ["Admin", "Gerente", "Operador"] },
  { area: "Entradas, ajustes e etiquetas", roles: ["Admin", "Gerente", "Operador"] },
  { area: "Cadastrar e editar clientes", roles: ["Admin", "Gerente"] },
  { area: "Contas a pagar e a receber (lançar, baixar, cancelar)", roles: ["Admin", "Gerente"] },
  { area: "Fluxo de caixa e relatórios gerenciais", roles: ["Admin", "Gerente"] },
  { area: "Auditoria de caixa", roles: ["Admin", "Gerente"] },
  { area: "Preferências de alertas e PDV", roles: ["Admin", "Gerente"] },
  { area: "Dados da empresa", roles: ["Admin"] },
  { area: "Excluir clientes", roles: ["Admin"] },
];

export function UsersTab() {
  const session = useSession();

  return (
    <div className="space-y-6">
      <Alert>
        <Info />
        <AlertTitle>Ambiente de demonstração</AlertTitle>
        <AlertDescription>
          Os usuários abaixo são fixos. Saia e entre com outro perfil para ver como as permissões mudam a interface.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-3">
        {USERS.map((user) => {
          const me = session?.id === user.id;
          return (
            <Card key={user.id} className={cn(me && "ring-2 ring-primary/40")}>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Avatar className="size-10">
                    <AvatarFallback className="bg-primary/10 font-medium text-primary">{initials(user.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-medium">
                      {user.name}
                      {me && <StatusBadge tone="info">Você</StatusBadge>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <StatusBadge tone={ROLE_INFO[user.role].tone}>
                    <ShieldCheck />
                    {user.role}
                  </StatusBadge>
                  <p className="text-xs text-muted-foreground">{ROLE_INFO[user.role].summary}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle>Permissões por perfil</CardTitle>
          <CardDescription>O que cada perfil pode fazer no sistema.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Área</TableHead>
                {ROLES.map((role) => (
                  <TableHead key={role} className="w-28 text-center">
                    {role}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {PERMISSIONS.map((p) => (
                <TableRow key={p.area}>
                  <TableCell className="pl-4">{p.area}</TableCell>
                  {ROLES.map((role) => (
                    <TableCell key={role} className="text-center">
                      {p.roles.includes(role) ? (
                        <Check className="mx-auto size-4 text-success" aria-label="Permitido" />
                      ) : (
                        <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="Sem acesso" />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
