"use client";

import { AlertCircle, Inbox, RotateCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { errorMessage } from "@/lib/errors";

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>Não foi possível carregar os dados</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>{errorMessage(error)}</span>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RotateCw />
            Tentar novamente
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function EmptyState({
  title = "Nada por aqui",
  description,
  icon: Icon = Inbox,
  children,
}: {
  title?: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children?: React.ReactNode;
}) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {children}
    </Empty>
  );
}
