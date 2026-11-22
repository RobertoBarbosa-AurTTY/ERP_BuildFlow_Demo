"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Layers, LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLogout, useSession } from "@/lib/auth";
import { initials } from "@/lib/format";

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  if (!now) return null;
  return (
    <span className="tabular hidden text-sm text-muted-foreground sm:inline">
      {now.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })} ·{" "}
      {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </span>
  );
}

export function PosTopbar() {
  const user = useSession();
  const logout = useLogout();
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <header className="no-print sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard">
          <ArrowLeft />
          <span className="hidden sm:inline">Voltar ao painel</span>
        </Link>
      </Button>
      <Separator orientation="vertical" className="data-[orientation=vertical]:h-5" />
      <div className="flex items-center gap-2 font-semibold">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Layers className="size-3.5" />
        </div>
        <span>
          BuildFlow <span className="font-normal text-muted-foreground">PDV</span>
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Clock />
        <Separator orientation="vertical" className="hidden data-[orientation=vertical]:h-5 sm:block" />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Alternar tema"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          <Sun className="hidden dark:block" />
          <Moon className="dark:hidden" />
        </Button>
        <div className="flex items-center gap-2">
          <Avatar className="size-8 rounded-lg">
            <AvatarFallback className="rounded-lg bg-primary/10 text-xs text-primary">
              {initials(user?.name)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden text-sm leading-tight md:block">
            <div className="font-medium">{user?.name}</div>
            <div className="text-xs text-muted-foreground">{user?.role}</div>
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Sair" onClick={logout}>
              <LogOut />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Sair</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
