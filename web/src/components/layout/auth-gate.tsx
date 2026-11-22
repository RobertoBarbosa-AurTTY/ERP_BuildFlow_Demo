"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/lib/auth";

// A sessão (demo) vive no localStorage, então só é conhecida no navegador.
// A página é sempre renderizada (o Next valida a navegação instantânea dos
// segmentos), mas fica oculta até a sessão ser confirmada.
export function AuthGate({ children }: { children: React.ReactNode }) {
  const user = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (user === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [user, router, pathname]);

  return (
    <>
      {!user && (
        <div className="flex min-h-svh items-center justify-center">
          <Spinner className="size-6 text-muted-foreground" />
        </div>
      )}
      <div hidden={!user} className="contents">
        {/* Telas usam a data atual e dados do navegador: renderizam por visita, não no prerender. */}
        <Suspense>{children}</Suspense>
      </div>
    </>
  );
}
