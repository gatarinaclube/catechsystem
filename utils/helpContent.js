const HELP_SECTIONS = [
  {
    title: "Primeiros Passos",
    description: "Sequencia recomendada para colocar o sistema em uso com segurança.",
    items: [
      {
        title: "Configuração inicial",
        tags: ["primeiro acesso", "configurações", "gatil"],
        content:
          "No primeiro acesso, salve a pagina Configurações antes de usar os demais módulos. Informe dados do gatil, logo, raças criadas, exames usados, dados do veterinário quando houver e preferências de vacina.",
      },
      {
        title: "Fluxo básico de uso",
        tags: ["onboarding", "rotina"],
        content:
          "Comece cadastrando reprodutores, depois registre ninhadas e filhotes. Em seguida use vacinação, vermifugação, pesagem, tratamento, exames e histórico para manter a rotina completa.",
      },
      {
        title: "Raças e exames selecionados",
        tags: ["raças", "exames", "cadastro"],
        content:
          "As raças selecionadas em Configurações reduzem as listas nos cadastros. Se nenhuma raça for marcada, todas continuam disponíveis. O mesmo vale para os exames: novos usuários começam com todos selecionados.",
      },
      {
        title: "Módulos do menu",
        tags: ["menu", "módulos", "plano", "on/off"],
        content:
          "Em Configurações, cada usuário pode ligar ou desligar os módulos que deseja ver no menu lateral. Módulos não permitidos pelo plano aparecem bloqueados com a indicação dos planos que dão acesso.",
      },
    ],
  },
  {
    title: "Gestão do Gatil",
    description: "Módulos usados na rotina operacional dos gatos e ninhadas.",
    items: [
      {
        title: "Reprodutores",
        tags: ["padreadores", "matrizes", "fundadores", "microchip"],
        content:
          "Cadastre padreadores, matrizes e fundadores. Gatos adultos devem manter microchip. Quando houver óbito, informe a causa para manter o histórico completo.",
      },
      {
        title: "Acasalamentos",
        tags: ["cruza", "reprodução", "suplementação"],
        content:
          "Planeje cruza, acompanhe gatas prontas, pausas reprodutivas e status de cada fêmea. Quando a suplementação pré/pós cruzamento estiver ativa em Configurações, o módulo sinaliza as fêmeas dentro do período.",
      },
      {
        title: "Ninhadas",
        tags: ["parto", "filhotes", "óbito", "mortalidade"],
        content:
          "Registre nascimento, pais, filhotes e estatísticas de parto. Em mortes ao parto ou pós-parto, selecione a causa para que apareça no histórico.",
      },
      {
        title: "Filhotes",
        tags: ["mapa de ninhada", "proprietário", "venda"],
        content:
          "Filhotes entram pelo Registro de Ninhada ou pelo módulo Ninhadas. O módulo Filhotes é para consulta e edição. Filhote vendido por Receitas/Vendas recebe automaticamente o vínculo do comprador.",
      },
      {
        title: "Vacinação",
        tags: ["antirrábica", "feline", "vencimento"],
        content:
          "Controle datas de vacinas, vencimentos e próximas ações. Ao concluir alterações, use Atualizar no gato correspondente para confirmar o salvamento e recalcular o status.",
      },
      {
        title: "Vermifugação",
        tags: ["vermífugo", "rotina sanitária"],
        content:
          "Registre aplicações e acompanhe próximas rotinas. Gatos em óbito ou fora da propriedade ativa não devem aparecer nas listas operacionais.",
      },
      {
        title: "Pesagem",
        tags: ["peso", "crescimento", "filhotes"],
        content:
          "Acompanhe peso e evolução, principalmente de filhotes. Os registros ficam associados ao animal e podem ser consultados no histórico.",
      },
      {
        title: "Tratamento",
        tags: ["medicação", "dose", "horários", "histórico"],
        content:
          "Cadastre medicações antes de lançar tratamentos. Em Novo Tratamento, selecione um ou mais animais e uma ou mais medicações. O lançamento é salvo também no histórico do gato.",
      },
      {
        title: "Exames",
        tags: ["PKDef", "PRA", "HCM", "laudos", "PDF"],
        content:
          "Registre exames próprios ou herdados, anexe laudos e use a impressão de exames para comprovar resultados. HCM imprime somente exames do gato selecionado.",
      },
      {
        title: "Histórico",
        tags: ["linha do tempo", "registros", "consulta"],
        content:
          "Consulta consolidada dos eventos do animal: dados cadastrais, nascimentos, tratamentos, vacinas, vermifugação, pesagem, exames e ocorrências.",
      },
    ],
  },
  {
    title: "Administrativo e Financeiro",
    description: "Receitas, despesas, contas, cadastros e relatórios financeiros.",
    items: [
      {
        title: "Financeiro",
        tags: ["administrativo", "contas", "receitas", "despesas"],
        content:
          "A área Financeiro reúne Receitas/Vendas, Despesas, Contas a Receber, Contas a Pagar, Contas, Clientes, Fornecedores e Produtos/Serviços.",
      },
      {
        title: "Receitas/Vendas",
        tags: ["venda", "cliente", "parcelas", "filhote"],
        content:
          "Registre venda de filhotes, produtos ou serviços. Ao selecionar um filhote e um cliente, o comprador passa a constar no cadastro do filhote.",
      },
      {
        title: "Despesas",
        tags: ["fornecedor", "categoria", "nota fiscal", "IA"],
        content:
          "Lance despesas pagas, selecione fornecedor ou informe CNPJ avulso, categoria, conta e comprovante. A identificação por IA exige OPENAI_API_KEY configurada no servidor.",
      },
      {
        title: "Fornecedores",
        tags: ["CNPJ", "categoria padrão", "despesas"],
        content:
          "Cadastre fornecedores com CNPJ, contato e Categoria Padrão obrigatória. Ao selecionar fornecedor em despesas, a categoria pode ser preenchida automaticamente.",
      },
      {
        title: "Contas e cartões de crédito",
        tags: ["cartão", "fatura", "fechamento", "vencimento"],
        content:
          "Contas podem ser banco, caixa ou cartão de crédito. Cartões possuem fechamento e vencimento, aparecem em relatório próprio e recebem pagamentos via transferência.",
      },
      {
        title: "Relatórios",
        tags: ["fluxo de caixa", "receitas", "despesas", "PDF"],
        content:
          "Use relatórios para fluxo de caixa, receitas, despesas, cartões e resumo reserva/pagamento. Cancelamentos e estornos aparecem conforme a regra do relatório.",
      },
      {
        title: "Resumo Reserva/Pagamento",
        tags: ["planilha", "reserva", "pagamento", "ninhada"],
        content:
          "Adicione ninhadas para acompanhar filhote, comprador, entrega, reserva aérea, valores, pagamentos, grupo, manual e situação. Campos editáveis são salvos para consulta posterior.",
      },
    ],
  },
  {
    title: "Comunicação e Vendas",
    description: "Ferramentas para divulgar filhotes, organizar clientes e vender melhor.",
    items: [
      {
        title: "Vitrine de Filhotes",
        tags: ["publicação", "página pública", "filhotes", "leads"],
        content:
          "Configure a página pública com logo, cores, textos, formas de pagamento, informações do gatil, ninhadas, filhotes e evolução de filhotes. A página pode ser enviada ao cliente sem login.",
      },
      {
        title: "Acessos da Vitrine",
        tags: ["analytics", "visitas", "cidade", "whatsapp"],
        content:
          "Acompanhe visitas, ações, cliques, cidade aproximada por IP quando disponível e interesse dos visitantes. Use esses dados para priorizar contatos de venda.",
      },
      {
        title: "CRM",
        tags: ["clientes", "e-mail marketing", "campanhas"],
        content:
          "O CRM separa clientes cadastrados de contatos de e-mail marketing. Campanhas usam o SMTP próprio configurado em Configurações.",
      },
      {
        title: "E-mail marketing",
        tags: ["SMTP", "campanha", "descadastro", "teste"],
        content:
          "Configure remetente, layout, imagem, textos, botões e destinatários. Sem SMTP próprio, o usuário não envia e-mail marketing. Notificações e documentos automáticos usam o remetente PetGus quando não houver SMTP próprio.",
      },
      {
        title: "Painel",
        tags: ["televisão", "tela", "rotina"],
        content:
          "Painel público para abrir em navegador ou tela fixa, com medicações, vacinas, acasalamentos e exames. Atualiza automaticamente conforme configuração do módulo.",
      },
    ],
  },
  {
    title: "Documentos e Serviços",
    description: "Documentos internos, PDFs, assinaturas e solicitações oficiais.",
    items: [
      {
        title: "Documentos",
        tags: ["contrato", "atestado", "manual", "PDF"],
        content:
          "Crie contrato de venda, atestado de saúde e manual de cuidados. Documentos salvos ficam dentro de cada tipo para edição, download e envio.",
      },
      {
        title: "Assinatura eletrônica",
        tags: ["contrato", "assinatura", "destinatários", "auditoria"],
        content:
          "Envie PDF para assinatura, marque os locais de assinatura para destinatários e usuário, acompanhe status e gere evidências quando assinado.",
      },
      {
        title: "Redutor de PDF",
        tags: ["compressão", "arquivo", "limite"],
        content:
          "Ferramenta para reduzir PDF sem salvar o arquivo no sistema. Há limites mensais conforme perfil: Básico 2 arquivos, Master 5 arquivos e Premium ilimitado.",
      },
      {
        title: "Serviços",
        tags: ["FFB", "pendência", "correção"],
        content:
          "Usuários solicitam serviços e acompanham pendências. Quando o administrador marca pendência, o usuário deve conseguir editar o serviço original e reenviar.",
      },
      {
        title: "Serviços FFB",
        tags: ["administrador", "PDF", "ZIP", "certificados"],
        content:
          "Área do administrador para revisar solicitações, editar quando permitido, gerar PDFs e ZIPs com anexos como pedigree, certificados e atestados.",
      },
    ],
  },
  {
    title: "Sistema, Perfis e Suporte",
    description: "Acesso, planos, limites, administrador e atualização das orientações.",
    items: [
      {
        title: "Perfis e limites",
        tags: ["Básico", "Master", "Premium", "Associado"],
        content:
          "Perfis definem acesso a módulos, limites de arquivos, ninhadas, padreadores, vitrine e recursos financeiros. O administrador pode ajustar limites em Configurações.",
      },
      {
        title: "Administrador visualizando usuários",
        tags: ["somente leitura", "usuários", "admin"],
        content:
          "O administrador pode visualizar como um usuário para conferir cadastros sem editar. Nesse modo, ações de salvamento ficam bloqueadas.",
      },
      {
        title: "Microchip público",
        tags: ["microchip", "animal perdido", "cadastro público"],
        content:
          "Página pública permite buscar microchip e cadastrar animais. Gatos cadastrados nos módulos internos também entram na pesquisa pública quando possuem microchip.",
      },
      {
        title: "Atualização das ajudas",
        tags: ["orientações", "informações", "manutenção"],
        content:
          "Sempre que um módulo, regra, campo ou fluxo for alterado, atualize também esta Central de Ajuda e os ícones de informação espalhados pelo sistema.",
      },
      {
        title: "Contato de suporte",
        tags: ["suporte", "ajuda", "whatsapp"],
        content:
          "Para suporte do PetGus, entre em contato pelo e-mail petgus@gatofilia.com.br ou WhatsApp +55 49 93381-6900.",
      },
    ],
  },
];

module.exports = { HELP_SECTIONS };
