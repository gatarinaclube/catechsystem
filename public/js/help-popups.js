(function () {
  const contextualHelp = {
    "Acasalamentos": "Planeje acasalamentos, acompanhe datas importantes e identifique gatas aptas para reprodução.",
    "Administrativo": "Centraliza a gestão financeira e administrativa: contas, receitas, despesas, clientes, fornecedores e contas a pagar ou receber.",
    "A Receber": "Mostra valores pendentes de recebimento, principalmente parcelas relacionadas a vendas.",
    "Atalhos rápidos": "Reúne caminhos curtos para ações usadas com frequência.",
    "Busca": "Pesquise informações cadastradas no sistema, como gatos, clientes, serviços e registros relacionados.",
    "Cabeçalho público": "Define as informações principais que aparecem no topo da página pública, como nome, links e apresentação do gatil.",
    "Certificados": "Anexe os certificados necessários para comprovar a solicitação do serviço.",
    "Clientes": "Cadastre e consulte clientes usados em vendas, receitas e vínculo de propriedade dos filhotes.",
    "Configuração da página pública": "Define informações exibidas para visitantes, contatos, valores e regras da página pública.",
    "Configuração do Remetente": "Configure o SMTP próprio do usuário para envio de e-mail marketing com remetente personalizado.",
    "Configurações": "Ajuste dados do gatil, veterinário, logo, raças, exames e limites dos perfis. As raças e exames selecionados filtram os campos exibidos nos cadastros.",
    "Contas": "Cadastre contas financeiras, incluindo caixa, bancos e cartões de crédito usados em receitas, despesas e relatórios.",
    "Contas a Pagar": "Cadastre obrigações futuras, fixas ou variáveis, para depois efetivar o pagamento como despesa.",
    "Contas a Receber": "Acompanhe parcelas em aberto, pagas ou canceladas, evitando pendências no controle financeiro.",
    "Contatos de E-mail": "Cadastre e-mails separados da lista de clientes para campanhas de e-mail marketing.",
    "CRM": "Gerencie clientes, contatos de e-mail, campanhas e configurações de e-mail marketing.",
    "Dados do Gatil": "Informe os dados oficiais do gatil usados em telas, documentos e comunicações.",
    "Dados do Veterinário": "Registre os dados do veterinário responsável para uso em documentos e controles sanitários.",
    "Dados pessoais": "Preencha dados pessoais do usuário para cadastro e validação no sistema.",
    "Despesas": "Registre despesas pagas e acompanhe saídas por fornecedor, categoria, conta e competência.",
    "Despesas encontradas": "Lista as despesas filtradas no relatório, conforme período, conta e demais filtros selecionados.",
    "Destinatários": "Escolha se a campanha será enviada para todos, selecionados, digitados manualmente ou apenas teste.",
    "E-mails cadastrados": "Lista os contatos disponíveis para campanhas de e-mail marketing do usuário.",
    "E-mails Salvos": "Guarde campanhas prontas para editar e reutilizar em novos envios.",
    "Enviar E-mail Marketing": "Monte a campanha com assunto, imagem, texto, anexos, botões e destinatários antes do envio.",
    "Exames": "Controle somente os exames selecionados nas Configurações, anexando laudos e imprimindo comprovações quando necessário.",
    "Filhotes": "Cadastre e acompanhe filhotes, dados de origem, disponibilidade, propriedade e histórico.",
    "Fluxo de Caixa": "Mostra entradas e saídas por período, incluindo movimentações entre contas e estornos quando aplicável.",
    "Fornecedores": "Cadastre fornecedores com CNPJ, contato, endereço e categoria padrão para agilizar despesas.",
    "Formas de pagamento": "Configure textos e condições de pagamento exibidas na página pública da vitrine.",
    "Fotos publicadas": "Mostra as fotos disponíveis na galeria pública e permite administrar seleção, exibição e exclusões.",
    "Gato": "Selecione ou informe o gato relacionado ao serviço ou registro.",
    "Histórico": "Registre e consulte informações importantes do animal ao longo do tempo.",
    "Imprimir exames": "Selecione um gato e baixe os documentos de PKDef, PRA, HCM ou todos os exames disponíveis.",
    "Informações da Ninhada": "Preencha dados principais da ninhada, como pais, nascimento e informações reprodutivas.",
    "Informações de Propriedade": "Vincule o filhote ao cliente proprietário quando houver venda ou cadastro manual permitido.",
    "Informações dos Filhotes": "Preencha dados individuais dos filhotes, como número, sexo, nome, microchip, cor, registro e pais.",
    "Informações sobre o gatil": "Inclua texto e apresentação em PDF para enriquecer a página pública da vitrine.",
    "Layout do E-mail": "Defina fonte, cores, links padrão e rodapé para deixar o e-mail marketing profissional.",
    "Limites dos perfis": "Permite ao administrador configurar limites e regras dos perfis do sistema.",
    "Lista de gatos a receber": "Mostra vendas e parcelas pendentes vinculadas aos gatos.",
    "Logo": "Envie o logo que será exibido na página pública ou nos materiais relacionados.",
    "Logo do Gatil": "Envie a marca do gatil para personalizar páginas e documentos.",
    "Logo nas fotos de baixa qualidade": "Define a marca d'agua aplicada nas fotos reduzidas exibidas publicamente.",
    "Medicações cadastradas": "Cadastre medicações antes de lançar tratamentos e edite nomes quando necessário.",
    "Membro": "Configure informações de associação ou vínculo do usuário com clubes e entidades.",
    "Novo arquivo (PDF)": "Envie o arquivo PDF necessário para substituir ou cadastrar o documento usado pelo módulo.",
    "Novo fornecedor": "Cadastre fornecedores para uso em despesas e contas a pagar. Informe primeiro o CNPJ para buscar dados da empresa.",
    "Novo tratamento": "Selecione animais e informe uma ou mais medicações, com dose, frequência, horários, via, início e fim.",
    "Ninhada": "Configure dados gerais da ninhada exibida ou registrada no sistema.",
    "Ninhadas": "Registre ninhadas, filhotes, estatísticas de parto e informações reprodutivas.",
    "Painel Administrativo": "Resume receitas, despesas e próximos vencimentos financeiros.",
    "Painel Operacional": "Resume rotina do gatil, como filhotes disponíveis, vacinas vencidas e tratamentos ativos.",
    "Pai": "Informe dados do pai usados na vitrine ou nos registros da ninhada.",
    "Pesagem": "Registre e acompanhe peso dos gatos e filhotes ao longo do tempo.",
    "Prévia do E-mail": "Mostra como o e-mail marketing ficará para quem receber a campanha.",
    "Próximas ações": "Mostra itens que exigem atenção ou atualização nos próximos dias.",
    "Produtos/Serviços": "Cadastre produtos e serviços que podem ser selecionados ao lançar receitas.",
    "Raças": "Selecione as raças criadas pelo gatil para reduzir as opções nos cadastros. Sem seleção, todas as raças continuam disponíveis.",
    "Receitas": "Acompanhe valores recebidos, vendas e entradas financeiras no período selecionado.",
    "Receitas encontradas": "Lista receitas filtradas por período, conta e demais critérios do relatório.",
    "Receitas/Vendas": "Registre vendas de filhotes, produtos ou serviços e acompanhe pagamentos.",
    "Regras Para Homologação de Título": "Leia os critérios e documentos necessários para solicitar a homologação de título.",
    "Regras para Homologação de Pedigree": "Consulte os critérios e documentos necessários para homologação de pedigree.",
    "Relatório Contábil": "Organiza receitas, valores a receber e despesas por conta e período.",
    "Relatórios": "Acesse relatórios financeiros e estratégicos do gatil.",
    "Reprodutores": "Gerencie padreadores, matrizes e gatos usados na reprodução.",
    "Segurança": "Defina senha e dados de acesso do usuário.",
    "Serviços": "Solicite serviços, acompanhe protocolos enviados e corrija pendências quando necessário.",
    "Serviços FFB": "Revise serviços recebidos, gere documentos e acompanhe envio para a federação ou associação.",
    "Solicitação": "Informe o tipo de serviço ou correção que deseja solicitar.",
    "Solicitações recentes": "Acompanhe pedidos enviados por visitantes ou clientes na página pública.",
    "Título solicitado": "Informe o título que será solicitado para homologação.",
    "Tratamento": "Registre medicações, doses, horários e períodos de tratamento, mantendo histórico do animal.",
    "Tratamentos Ativos": "Lista tratamentos em andamento hoje, considerando data de início e data final.",
    "Tratamentos recentes finalizados": "Mostra os últimos tratamentos encerrados, mantendo a tela principal mais limpa.",
    "Transferência de Propriedade": "Informe dados necessários para transferir a propriedade de um gato.",
    "Usuários": "Gerencie cadastros, perfis, aprovações e dados dos usuários.",
    "Vacinação": "Controle vacinas aplicadas, vencidas e próximas datas.",
    "Valores dos Serviços": "Mostra valores de referência dos serviços disponíveis.",
    "Vermifugação": "Controle aplicações de vermífugo e próximas rotinas.",
    "Visual da página pública": "Personalize cores e aparência da página pública vista pelos visitantes.",
    "Vitrine de Filhotes": "Configure a página pública de filhotes disponíveis, textos, cores, fotos, formas de pagamento e dados do gatil.",
    "Últimas campanhas": "Acompanhe campanhas enviadas, entregas, falhas e aberturas detectadas.",
  };

  const startsWithHelp = [
    {
      prefix: "Despesas - Conta",
      text: "Mostra despesas agrupadas por conta financeira, facilitando conferência de saídas e fluxo por conta.",
    },
    {
      prefix: "Medicação",
      text: "Preencha os dados desta medicação para os animais selecionados. Use o botão de adicionar para lançar mais de uma medicação no mesmo envio.",
    },
    {
      prefix: "Opção",
      text: "Informe uma opção solicitada pelo formulário. Preencha de forma clara para facilitar análise do serviço.",
    },
  ];

  function normalizeTitle(value) {
    return String(value || "")
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
      .replace(/\s+i\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function helpForTitle(title) {
    if (contextualHelp[title]) return contextualHelp[title];
    const rule = startsWithHelp.find((item) => title.startsWith(item.prefix));
    return rule ? rule.text : "";
  }

  function addAutomaticHelpButtons() {
    const selectors = [".welcome-title", ".content-title", ".section-title"];
    document.querySelectorAll(selectors.join(",")).forEach((element) => {
      if (element.querySelector(".help-info-button")) return;
      const title = normalizeTitle(element.textContent);
      const text = helpForTitle(title);
      if (!text) return;

      const button = document.createElement("button");
      button.className = "help-info-button";
      button.type = "button";
      button.dataset.helpTitle = title;
      button.dataset.helpText = text;
      button.setAttribute("aria-label", `Informações sobre ${title}`);
      button.textContent = "i";

      element.classList.add("title-with-help");
      element.appendChild(button);
    });
  }

  function ensureModal() {
    let modal = document.querySelector("[data-help-modal]");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "help-modal";
    modal.setAttribute("data-help-modal", "");
    modal.setAttribute("hidden", "");
    modal.innerHTML = `
      <div class="help-modal-backdrop" data-help-close></div>
      <section class="help-modal-card" role="dialog" aria-modal="true" aria-labelledby="helpModalTitle">
        <button class="help-modal-close" type="button" aria-label="Fechar" data-help-close>&times;</button>
        <div class="help-modal-kicker">Informações</div>
        <h2 id="helpModalTitle" class="help-modal-title"></h2>
        <div class="help-modal-text"></div>
      </section>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function openHelp(button) {
    const modal = ensureModal();
    const title = modal.querySelector(".help-modal-title");
    const text = modal.querySelector(".help-modal-text");
    title.textContent = button.dataset.helpTitle || "Informações";
    text.textContent = button.dataset.helpText || "Orientação não cadastrada.";
    modal.removeAttribute("hidden");
    document.body.classList.add("help-modal-open");
    modal.querySelector("[data-help-close]")?.focus();
  }

  function closeHelp() {
    const modal = document.querySelector("[data-help-modal]");
    if (!modal) return;
    modal.setAttribute("hidden", "");
    document.body.classList.remove("help-modal-open");
  }

  document.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-help-title][data-help-text]");
    if (opener) {
      event.preventDefault();
      event.stopPropagation();
      openHelp(opener);
      return;
    }

    if (event.target.closest("[data-help-close]")) {
      event.preventDefault();
      closeHelp();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeHelp();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addAutomaticHelpButtons);
  } else {
    addAutomaticHelpButtons();
  }
})();
