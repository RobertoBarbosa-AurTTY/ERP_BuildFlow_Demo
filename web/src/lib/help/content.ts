import {
  Boxes,
  ChartLine,
  ChartPie,
  FileDown,
  HandCoins,
  History,
  MapPin,
  ReceiptText,
  Settings,
  ShoppingCart,
  Tags,
  TrendingUp,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface HelpTopic {
  title: string;
  body?: string;
  steps?: string[];
  tip?: string;
}

export interface HelpModule {
  id: string;
  title: string;
  summary: string;
  href: string;
  icon: LucideIcon;
  group: "Operação" | "Financeiro" | "Análises" | "Sistema";
  topics: HelpTopic[];
}

export const MODULES: HelpModule[] = [
  {
    id: "pdv",
    title: "PDV / Vendas",
    summary: "Registre vendas e orçamentos no balcão, com descontos e pagamento dividido.",
    href: "/pos",
    icon: ShoppingCart,
    group: "Operação",
    topics: [
      {
        title: "Como realizar uma venda",
        steps: [
          "Abra o PDV no menu lateral (o caixa precisa estar aberto).",
          "Leia o código de barras ou digite SKU/nome no campo de busca — use F2 para a busca avançada.",
          "Ajuste a quantidade de cada item no carrinho.",
          "Pressione F9 (ou clique em Finalizar) e escolha a forma de pagamento.",
          "Confirme para emitir o cupom e baixar o estoque automaticamente.",
        ],
      },
      {
        title: "Descontos por item e na venda",
        body: "Cada item aceita desconto em percentual ou em valor. Para descontar o total da venda, use F4. O desconto do item é aplicado antes do desconto geral.",
      },
      {
        title: "Venda com estoque negativo",
        body: "Se um produto estiver sem saldo, o sistema avisa e pede confirmação. A venda pode prosseguir e o estoque fica negativo até a próxima entrada.",
      },
      {
        title: "Orçamentos, cliente e crediário",
        body: "Use F7 para salvar o carrinho como orçamento e F3 para vincular um cliente. Vendas no Crediário exigem cliente e geram contas a receber.",
      },
      {
        title: "Sangria e suprimento",
        body: "F10 registra uma retirada (sangria) do caixa e F8 um suprimento de troco. Os valores entram na conferência do fechamento.",
      },
    ],
  },
  {
    id: "estoque",
    title: "Estoque",
    summary: "Cadastro de produtos, níveis mínimo/máximo, validade e categorias.",
    href: "/stock",
    icon: Boxes,
    group: "Operação",
    topics: [
      {
        title: "Consultar produtos",
        body: "Filtre por categoria, status (em estoque, baixo, sem estoque, acima do máximo) e busque por nome, SKU ou código de barras.",
      },
      {
        title: "Cadastrar ou editar produto",
        steps: [
          "Clique em Novo produto.",
          "Preencha nome, SKU, unidade, preço de venda e custo.",
          "Defina estoque mínimo e máximo para receber alertas.",
          "Para perecíveis, informe a data de validade.",
        ],
      },
      {
        title: "Custo e margem",
        body: "O custo unitário é usado no cálculo de margem e de lucro dos relatórios. Mantenha-o atualizado a cada entrada de mercadoria.",
      },
    ],
  },
  {
    id: "entradas",
    title: "Entradas",
    summary: "Recebimento de mercadorias de fornecedores e ajuste do saldo.",
    href: "/receiving",
    icon: FileDown,
    group: "Operação",
    topics: [
      {
        title: "Registrar uma entrada",
        steps: [
          "Acesse Entradas no menu.",
          "Busque o produto e informe quantidade e custo.",
          "Adicione todos os itens da nota ao lote.",
          "Finalize a entrada para atualizar o estoque e gerar as movimentações.",
        ],
      },
    ],
  },
  {
    id: "importacao",
    title: "Importação de fornecedor",
    summary: "Importe catálogos de fornecedores em CSV ou XML.",
    href: "/import",
    icon: Upload,
    group: "Operação",
    topics: [
      {
        title: "Importar produtos",
        steps: [
          "Envie o arquivo CSV ou XML do fornecedor.",
          "Revise os produtos reconhecidos e corrija o que for necessário.",
          "Confirme para adicionar ou atualizar os produtos no estoque.",
        ],
      },
    ],
  },
  {
    id: "etiquetas",
    title: "Etiquetas",
    summary: "Etiquetas de preço com código de barras e etiquetas de prateleira.",
    href: "/price-tag",
    icon: Tags,
    group: "Operação",
    topics: [
      {
        title: "Gerar etiquetas de preço",
        steps: [
          "Acesse Etiqueta de preço.",
          "Selecione os produtos pela busca ou filtros.",
          "Gere e imprima: cada etiqueta traz nome, preço e código de barras.",
        ],
      },
      {
        title: "Etiquetas de prateleira",
        body: "Em Etiqueta de prateleira, escolha os produtos para imprimir etiquetas maiores com o endereço no depósito.",
      },
    ],
  },
  {
    id: "enderecamento",
    title: "Endereçamento",
    summary: "Localização física dos produtos: depósito, corredor, prateleira, nível e posição.",
    href: "/address",
    icon: MapPin,
    group: "Operação",
    topics: [
      {
        title: "Criar endereços",
        body: "Em Criar endereço, defina depósito, corredor, prateleira, nível e posição. O código é gerado no formato D01-A-01-01-05.",
      },
      {
        title: "Endereçar um produto",
        body: "Em Endereçar produto, busque o item e selecione o endereço onde ele fica guardado.",
      },
    ],
  },
  {
    id: "contas-pagar",
    title: "Contas a pagar",
    summary: "Despesas, fornecedores, contas recorrentes e parcelamentos.",
    href: "/bills",
    icon: ReceiptText,
    group: "Financeiro",
    topics: [
      {
        title: "Cadastrar uma conta",
        steps: [
          "Clique em Nova conta.",
          "Informe descrição, fornecedor, categoria, valor e vencimento.",
          "Para parcelar, indique o número de vezes: as parcelas vencem no mesmo dia de cada mês e ficam agrupadas.",
          "Marque como recorrente para despesas fixas (aluguel, energia, internet).",
        ],
      },
      {
        title: "Dar baixa (pagar)",
        body: "Clique em Pagar na linha da conta, confirme a data e a forma de pagamento. Em contas recorrentes, a próxima ocorrência é criada automaticamente para o mês seguinte.",
      },
      {
        title: "Status das contas",
        body: "Pendente: ainda no prazo. Vencido: pendente com data passada (calculado automaticamente). Pago e Cancelado não entram nos totais em aberto.",
      },
    ],
  },
  {
    id: "contas-receber",
    title: "Contas a receber",
    summary: "Vendas a prazo e crediário, com previsão de entradas.",
    href: "/receivables",
    icon: HandCoins,
    group: "Financeiro",
    topics: [
      {
        title: "Lançar uma conta a receber",
        body: "Clique em Nova conta, selecione um cliente cadastrado (ou digite o nome de um cliente avulso), informe valor e vencimento. É possível parcelar.",
      },
      {
        title: "Registrar recebimento",
        body: "Use Receber na linha da conta. O gráfico de entradas previstas mostra quanto deve entrar em cada um dos próximos 30 dias.",
      },
      {
        title: "Inadimplência",
        body: "Quando há contas vencidas, um alerta no topo lista os maiores devedores. Clique em Ver vencidas para filtrar.",
      },
    ],
  },
  {
    id: "fluxo",
    title: "Fluxo de caixa e auditoria",
    summary: "Entradas e saídas consolidadas e conferência dos caixas.",
    href: "/cash-flow",
    icon: TrendingUp,
    group: "Financeiro",
    topics: [
      {
        title: "Fluxo de caixa",
        body: "Consolida vendas, recebimentos e pagamentos por período para acompanhar o saldo projetado.",
      },
      {
        title: "Auditoria de caixa",
        body: "Disponível para gerentes: compara o valor contado no fechamento com o esperado (abertura + vendas em dinheiro + suprimentos − sangrias).",
      },
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard",
    summary: "Visão geral do dia e do mês.",
    href: "/dashboard",
    icon: ChartPie,
    group: "Análises",
    topics: [
      {
        title: "O que o painel mostra",
        body: "Faturamento diário e mensal, lucro (com base no custo dos produtos), mais vendidos, estoque baixo, produtos parados e vendas recentes.",
      },
    ],
  },
  {
    id: "relatorios",
    title: "Relatórios",
    summary: "Análises de vendas por período, forma de pagamento e produto.",
    href: "/reports",
    icon: ChartLine,
    group: "Análises",
    topics: [
      {
        title: "Relatório de vendas",
        body: "Escolha o período para ver totais, ticket médio, formas de pagamento e produtos mais vendidos. Exporte em CSV quando precisar.",
      },
    ],
  },
  {
    id: "historico",
    title: "Histórico de vendas",
    summary: "Consulta, reimpressão e cancelamento de vendas.",
    href: "/sales-history",
    icon: History,
    group: "Análises",
    topics: [
      {
        title: "Consultar e cancelar vendas",
        steps: [
          "Filtre por data, forma de pagamento ou busque pelo número/cliente.",
          "Abra a venda para ver os itens e pagamentos.",
          "Se necessário, cancele informando o motivo — o estoque é estornado.",
        ],
      },
    ],
  },
  {
    id: "clientes",
    title: "Clientes",
    summary: "Cadastro com CPF/CNPJ validado e histórico de compras.",
    href: "/customers",
    icon: Users,
    group: "Análises",
    topics: [
      {
        title: "Cadastrar cliente",
        body: "Informe nome, CPF ou CNPJ (os dígitos verificadores são conferidos), telefone, e-mail e endereço. E-mail e documento não podem se repetir.",
      },
      {
        title: "Histórico do cliente",
        body: "Clique no cliente para ver total gasto, número de compras, última compra, compras recentes e contas a receber em aberto.",
      },
    ],
  },
  {
    id: "configuracoes",
    title: "Configurações",
    summary: "Dados da empresa, tema, alertas, perfis e backup.",
    href: "/settings",
    icon: Settings,
    group: "Sistema",
    topics: [
      {
        title: "Dados da empresa",
        body: "Razão social, CNPJ, endereço e rodapé do cupom. Somente administradores podem alterar.",
      },
      {
        title: "Backup e restauração",
        body: "Na aba Dados, exporte todos os registros em JSON ou restaure o conjunto de demonstração original.",
        tip: "A restauração apaga as alterações feitas neste navegador.",
      },
    ],
  },
];

export const SHORTCUTS: { keys: string[]; label: string; description: string }[] = [
  { keys: ["F2"], label: "Buscar produto", description: "Abre a busca avançada por nome, SKU ou código" },
  { keys: ["F3"], label: "Cliente", description: "Vincula um cliente à venda" },
  { keys: ["F4"], label: "Desconto", description: "Aplica desconto no total da venda" },
  { keys: ["F6"], label: "Item avulso", description: "Adiciona um item sem cadastro" },
  { keys: ["F7"], label: "Orçamento", description: "Salva o carrinho como orçamento" },
  { keys: ["F8"], label: "Suprimento", description: "Registra entrada de troco no caixa" },
  { keys: ["F9"], label: "Finalizar", description: "Vai para o pagamento" },
  { keys: ["F10"], label: "Sangria", description: "Registra retirada do caixa" },
  { keys: ["Esc"], label: "Limpar", description: "Limpa o carrinho (pede confirmação)" },
];

export const FAQ: { q: string; a: string }[] = [
  {
    q: "Onde ficam salvos os dados desta versão?",
    a: "Esta é uma demonstração sem servidor: tudo fica no armazenamento local do navegador. Outro computador ou navegador verá os dados originais.",
  },
  {
    q: "Uma conta pendente ficou como “Vencido” sozinha. Por quê?",
    a: "O status vencido é calculado automaticamente: toda conta pendente com vencimento anterior a hoje aparece como vencida, sem ação manual.",
  },
  {
    q: "Como parcelar uma compra de fornecedor?",
    a: "Em Contas a pagar, clique em Nova conta, informe o valor total e o número de parcelas. O sistema divide o valor e agenda um vencimento por mês.",
  },
  {
    q: "Posso excluir apenas uma parcela?",
    a: "Sim. Use Excluir na parcela desejada. Para remover o parcelamento inteiro, use Excluir parcelamento: as parcelas já pagas continuam no histórico.",
  },
  {
    q: "Por que não consigo editar contas ou dados da empresa?",
    a: "As permissões dependem do perfil. Operadores consultam; gerentes lançam e dão baixa; administradores também alteram dados da empresa e excluem clientes.",
  },
  {
    q: "O CPF/CNPJ do cliente foi recusado.",
    a: "O sistema confere os dígitos verificadores. Revise o número digitado; documentos com todos os dígitos iguais também são recusados.",
  },
  {
    q: "Como volto os dados ao estado inicial?",
    a: "Em Configurações › Dados, use Restaurar dados de demonstração. Exporte um backup antes, se quiser guardar o que foi feito.",
  },
];

