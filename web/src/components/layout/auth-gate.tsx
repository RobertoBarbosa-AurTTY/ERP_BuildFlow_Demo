"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/lib/auth";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const user = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (user === null) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [user, router, pathname]);

  if (!user) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  return children;
}
