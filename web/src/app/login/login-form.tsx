"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { DEMO_LOGIN, login, useSession } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const user = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, next, router]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const session = await login(email, password);
      toast.success(`Bem-vindo, ${session.name.split(" ")[0]}!`);
      router.replace(next.startsWith("/") ? next : "/dashboard");
    } catch (error) {
      toast.error(errorMessage(error));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Entrar na sua conta</h1>
        <p className="text-sm text-muted-foreground">Use seu e-mail corporativo para acessar o painel.</p>
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="voce@empresa.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Senha</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Spinner />}
          Entrar
        </Button>
        <FieldDescription className="text-center">
          Versão de demonstração: os dados ficam salvos só neste navegador.
        </FieldDescription>
      </FieldGroup>

      <Alert>
        <Info />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>
            Demo: <span className="font-mono">{DEMO_LOGIN.email}</span> / <span className="font-mono">{DEMO_LOGIN.password}</span>
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setEmail(DEMO_LOGIN.email);
              setPassword(DEMO_LOGIN.password);
            }}
          >
            Preencher
          </Button>
        </AlertDescription>
      </Alert>
    </form>
  );
}
