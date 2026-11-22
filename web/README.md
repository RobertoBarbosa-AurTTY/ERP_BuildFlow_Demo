# BuildFlow ERP — Front-end

Novo front-end do BuildFlow em **Next.js 16 + shadcn/ui + Tailwind CSS 4**, substituindo o front antigo em HTML/JS (`public/`).

> **Status:** front-end estático com **dados de demonstração**. Ainda não está ligado às Netlify Functions do back-end.

## Rodando localmente

```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

Login de demonstração: `admin@buildflow.com.br` / `admin123` (também `gerente@buildflow.com.br` / `gerente123` e `caixa@buildflow.com.br` / `caixa123`).

## Build e deploy (Netlify)

```bash
npm run build      # gera o site estático em web/out
```

O `netlify.toml` na raiz do repositório já roda esse build e publica `web/out`, mantendo as functions em `netlify/functions` (`/api/*`).

## Estrutura

| Pasta | Conteúdo |
|:--|:--|
| `src/app/(app)` | Telas com menu lateral (dashboard, estoque, financeiro, relatórios…) |
| `src/app/(pos)` | PDV em tela cheia, independente do menu |
| `src/components/ui` | Componentes shadcn/ui |
| `src/components/*` | Componentes por domínio (`pos`, `inventory`, `finance`, `analytics`) |
| `src/lib/services` | Funções de dados usadas pelas telas (via React Query) |
| `src/lib/mock` | "Banco" em memória + `localStorage` e dados de demonstração |
| `src/lib/domain` | Tipos e regras de negócio (totais de venda, status de estoque e contas) |

## Ligando ao back-end

As telas só falam com `src/lib/services/*`. Para usar a API real, reescreva essas funções chamando `/api/<function>` (as Netlify Functions já existentes), sem mexer nas telas, e troque o login demo (`src/lib/auth.ts`) por `/api/auth-login` + `/api/auth-me`.
