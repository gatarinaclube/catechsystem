const FUTURE_FEATURES = [
  {
    key: "community",
    title: "Comunidade",
    eyebrow: "Fórum premium",
    description: "Espaço para discussões entre criadores, dúvidas por tema e troca de experiências com moderação.",
    status: "Planejado",
    readiness: 35,
    href: "#community",
  },
  {
    key: "mentoring",
    title: "Mentorias",
    eyebrow: "Agenda e encontros",
    description: "Estrutura para mentorias individuais ou em grupo, com histórico e materiais de apoio.",
    status: "Planejado",
    readiness: 25,
    href: "#mentoring",
  },
  {
    key: "lives",
    title: "Lives",
    eyebrow: "Aulas ao vivo",
    description: "Área preparada para calendário de transmissões, replay e anexos das aulas ao vivo.",
    status: "Planejado",
    readiness: 30,
    href: "#lives",
  },
  {
    key: "assistant",
    title: "IA Assistente",
    eyebrow: "Consulta orientada",
    description: "Base futura para perguntas sobre aulas, biblioteca, protocolos e organização do gatil.",
    status: "Planejado",
    readiness: 20,
    href: "#assistant",
  },
  {
    key: "notifications",
    title: "Notificações",
    eyebrow: "Engajamento",
    description: "Preparação para avisos de aulas novas, certificados, trilhas recomendadas e eventos.",
    status: "Planejado",
    readiness: 30,
    href: "#notifications",
  },
  {
    key: "gamification",
    title: "Conquistas",
    eyebrow: "Gamificação",
    description: "Estrutura visual para selos, marcos de progresso e metas de aprendizagem.",
    status: "Planejado",
    readiness: 40,
    href: "#gamification",
  },
];

function getAcademyFutureHub() {
  return {
    headline: "Recursos premium em preparação",
    summary:
      "A base da Academy já está preparada para evoluir com comunidade, mentorias, lives, notificações, certificados avançados e assistente inteligente.",
    features: FUTURE_FEATURES,
    nextMilestones: [
      "Definir quais recursos entram primeiro no produto pago.",
      "Criar modelos de dados específicos quando cada recurso for ativado.",
      "Conectar notificações, agenda e pagamentos recorrentes sem duplicar usuários.",
    ],
  };
}

module.exports = {
  getAcademyFutureHub,
};
