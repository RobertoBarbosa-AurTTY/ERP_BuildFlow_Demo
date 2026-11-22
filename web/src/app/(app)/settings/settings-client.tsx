"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, Database, SlidersHorizontal, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/query-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasRole, useSession } from "@/lib/auth";
import { getSettings } from "@/lib/services/settings";
import { CompanyTab } from "./company-tab";
import { DataTab } from "./data-tab";
import { PreferencesTab } from "./preferences-tab";
import { UsersTab } from "./users-tab";

export function SettingsClient() {
  const session = useSession();
  const query = useQuery({ queryKey: ["settings"], queryFn: getSettings });

  const loading = (
    <div className="grid gap-6 lg:grid-cols-2">
      <Skeleton className="h-80" />
      <Skeleton className="h-80" />
    </div>
  );
  const error = query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : null;

  return (
    <>
      <PageHeader title="Configurações" description="Dados da empresa, preferências, perfis de acesso e backup." />
      <Tabs defaultValue="company" className="gap-4">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="company">
              <Building2 />
              Empresa
            </TabsTrigger>
            <TabsTrigger value="preferences">
              <SlidersHorizontal />
              Preferências
            </TabsTrigger>
            <TabsTrigger value="users">
              <Users />
              Usuários
            </TabsTrigger>
            <TabsTrigger value="data">
              <Database />
              Dados
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="company">
          {error ??
            (query.data ? <CompanyTab settings={query.data} canEdit={hasRole(session, [])} /> : loading)}
        </TabsContent>
        <TabsContent value="preferences">
          {error ??
            (query.data ? <PreferencesTab settings={query.data} canEdit={hasRole(session, ["Gerente"])} /> : loading)}
        </TabsContent>
        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="data">
          <DataTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
