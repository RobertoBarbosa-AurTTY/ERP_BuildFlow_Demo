import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "success" | "warning" | "destructive" | "info";

const toneClass: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/12 text-destructive",
  info: "bg-primary/10 text-primary",
};

export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge variant="secondary" className={cn("border-transparent font-medium", toneClass[tone], className)}>
      {children}
    </Badge>
  );
}
