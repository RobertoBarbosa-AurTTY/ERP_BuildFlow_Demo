# BuildFlow ERP

BuildFlow é um sistema de gestão empresarial (ERP) moderno, desenvolvido com uma arquitetura **Serverless** e integrado ao **MongoDB Atlas**. Focado em eficiência, o sistema oferece uma interface premium para controle de estoque, frente de caixa (PDV), contas a pagar/receber e relatórios analíticos, com PWA (instalável e offline-first).

## 🚀 Tecnologias Utilizadas

- **Frontend**: HTML5, CSS3 (Variáveis, Flexbox, Grid), JavaScript (ES6+), PWA (Service Worker).
- **Backend**: Netlify Functions (Node.js Serverless).
- **Banco de Dados**: MongoDB Atlas (NoSQL, planos shared M0/M2/M5 — sem dependência de transações).
- **Relatórios**: jsPDF & jsPDF-AutoTable; leitura de XML/PDF via pdf.js (CDN).
- **Autenticação**: JWT (JSON Web Tokens) & Bcrypt.js, com rate limiting e validação de entrada.

## ✨ Principais Funcionalidades

- **Dashboard Inteligente**: Indicadores de faturamento, lucro, vendas e alertas de estoque em tempo real (com cache de 60s).
- **Controle de Estoque**:
  - Gerenciamento completo de SKUs numéricos, endereçamento de armazém e movimentações.
  - Filtros avançados por categoria e status; alertas de vencimento (produtos perecíveis).
  - Exportação de inventário em PDF profissional.
- **Entrada de Mercadorias**: Cadastro detalhado de produtos (Marca, Fornecedor, Código de Barras, validade) com importação de XML de NFe e leitura de PDF.
- **PDV (Ponto de Venda)**:
  - Frente de caixa ágil com suporte a atalhos de teclado e descontos.
  - Emissão de Orçamentos profissionais em PDF.
  - Baixa atômica de estoque após a venda (reserva → finalização → reversão em caso de falha).
  - Numeração de vendas (saleNumber) atômica e livre de concorrência.
- **Clientes**: Cadastro, busca e edição de clientes com CPF/CNPJ e contato.
- **Contas a Receber**:
  - Recebimentos avulsos, parcelados e recorrentes.
  - KPIs (total, vencido, a vencer, recebido), fluxo projetado de 30 dias e alertas de vencimento.
- **Fluxo de Caixa / DRE**: Projeção de 30 dias e demonstrativo de resultados consolidado.
- **Segurança**: Autenticação com roles (Admin/Gerente/Operador), rate limiting por IP, validação de payload, cookies HttpOnly e headers de segurança.
- **Auditoria**: Logs de sistema para rastreamento de ações críticas.
- **CI/CD**: GitHub Actions — lint + testes unitários sempre; integração e baseline quando `MONGODB_URI` disponível; deploy automático para Netlify.

## 📦 Como Instalar e Rodar

### Pré-requisitos
- Node.js (v18+).
- Conta no MongoDB Atlas.
- Netlify CLI (`npm install -g netlify-cli`).

### Configuração Inicial

1. Clone o repositório:
   ```bash
   git clone https://github.com/robertocarlossupplychain-cmd/BuildFlow.git
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Configure as variáveis de ambiente:
   Crie um arquivo `.env` na raiz do projeto com:
   ```env
   MONGODB_URI=sua_uri_do_mongodb_atlas
   JWT_SECRET=sua_chave_secreta_jwt
   ```

4. Inicialize o Banco de Dados (Seed — cria usuário Admin, produtos, clientes e contas a receber de exemplo):
   ```bash
   npm run seed
   ```

5. Garanta os índices do MongoDB (e rode as migrações quando necessário):
   ```bash
   npm run ensure-indexes
   npm run migrate-schema   # corrige divergências de esquema (ex.: saleNumber duplicado)
   npm run migrate-expiry   # consolida campos de validade dos produtos
   ```

6. Execute em ambiente de desenvolvimento:
   ```bash
   netlify dev
   ```

## 🧪 Testes e Qualidade

```bash
npm run build            # lint + testes unitários
npm test                 # testes unitários
npm run test:integration # testes de integração (requer MONGODB_URI)
npm run capture-baseline # captura o baseline das respostas da API
npm run compare-baseline # compara respostas atuais contra o baseline
```

O baseline cobre 19 endpoints (produtos, vendas, caixa, financeiro, clientes e contas a receber). A comparação é determinística (ignora ObjectIds, datas e arredondamentos de centavos).

## 🧹 Scripts de Manutenção

```bash
npm run reset-db     # restaura o banco ao estado do seed
npm run clear-sales  # limpa vendas de um período
```

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---
Desenvolvido por **Roberto Carlos Supply Chain CMD**.
