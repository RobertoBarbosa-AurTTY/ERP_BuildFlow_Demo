# BuildFlow ERP

BuildFlow é um sistema de gestão empresarial (ERP) moderno, desenvolvido com uma arquitetura **Serverless** e integrado ao **MongoDB Atlas**. Focado em eficiência, o sistema oferece uma interface premium para controle de estoque, frente de caixa (PDV) e relatórios analíticos.

## 🚀 Tecnologias Utilizadas

- **Frontend**: HTML5, CSS3 (Variáveis, Flexbox, Grid), JavaScript (ES6+).
- **Backend**: Netlify Functions (Node.js Serverless).
- **Banco de Dados**: MongoDB Atlas (NoSQL).
- **Relatórios**: jsPDF & jsPDF-AutoTable.
- **Autenticação**: JWT (JSON Web Tokens) & Bcrypt.js.

## ✨ Principais Funcionalidades

- **Dashboard Inteligente**: Indicadores de faturamento, lucro, vendas e alertas de estoque em tempo real.
- **Controle de Estoque**: 
  - Gerenciamento completo de SKUs numéricos.
  - Filtros avançados por categoria e status.
  - Exportação de inventário em PDF profissional.
- **Entrada de Mercadorias**:
  - Cadastro detalhado de produtos (Marca, Fornecedor, Código de Barras).
  - Cálculo automático de margem de lucro e preço de venda.
- **PDV (Ponto de Venda)**:
  - Frente de caixa ágil com suporte a atalhos de teclado.
  - Aplicação de descontos individuais e globais em tempo real.
  - Emissão de Orçamentos profissionais em PDF.
  - Baixa automática de estoque após a venda.
- **Auditoria**: Logs de sistema para rastreamento de ações críticas.

## 📦 Como Instalar e Rodar

### Pré-requisitos
- Node.js instalado.
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

4. Inicialize o Banco de Dados (Seed):
   ```bash
   node src/seed.js
   ```

5. Execute em ambiente de desenvolvimento:
   ```bash
   netlify dev
   ```

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---
Desenvolvido por **Roberto Carlos Supply Chain CMD**.
