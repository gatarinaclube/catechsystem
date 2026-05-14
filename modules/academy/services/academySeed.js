const { ACADEMY_LEVELS, slugify } = require("./academyService");

const ACADEMY_FOUNDATION = [
  {
    title: "Novo Criador",
    description: "Primeiros passos para estruturar uma criação responsável e sustentável.",
    modules: [
      "O que é criação responsável",
      "Estrutura mínima",
      "Quanto custa iniciar",
      "Como escolher uma raça",
      "Como escolher matrizes",
      "Planejamento inicial",
      "Erros mais comuns",
      "Hobby x profissional",
    ],
  },
  {
    title: "Guia de Associações",
    description: "Entenda associações, registros, ética e documentos oficiais.",
    modules: ["O que é FIFe", "Como funciona a FFB", "Registro de gatos", "Registro de gatil", "Pedigree", "Transferências", "Ética", "Regras"],
  },
  {
    title: "Guia de Exposições",
    description: "Preparação, regras e experiência prática em exposições felinas.",
    modules: ["Classes FIFe", "Como funciona julgamento", "Grooming", "Transporte", "Preparação do gato", "Steward", "Juiz", "Títulos", "Best in Variety", "Etiqueta em exposições"],
  },
  {
    title: "Guia de Raças",
    description: "Conteúdos por raça com origem, padrão, manejo, genética e saúde.",
    modules: ["Origem", "Padrão", "Temperamento", "Manejo", "Genética", "Saúde", "Dificuldades", "Perfil ideal do tutor"],
  },
  {
    title: "Genética",
    description: "Bases genéticas aplicadas à criação, seleção e saúde.",
    modules: ["Genética básica", "Cores", "Padrões", "Dominância", "Recessividade", "Linebreeding", "Outcross", "Testes genéticos", "Doenças hereditárias"],
  },
  {
    title: "Manejo de Gatil",
    description: "Rotina, organização, higiene, quarentena e maternidade.",
    modules: ["Higiene", "Enriquecimento ambiental", "Quarentena", "Adaptação", "Maternidade", "Rotina", "Organização"],
  },
  {
    title: "Saúde e Protocolos",
    description: "Protocolos essenciais de prevenção, neonatologia e emergência.",
    modules: ["Vacinação", "Vermifugação", "Neonatologia", "Desmame", "Isolamento", "Emergência", "Exames importantes"],
  },
  {
    title: "Reprodução",
    description: "Cio, acasalamento, gestação, parto e desenvolvimento dos filhotes.",
    modules: ["Cio", "Acasalamento", "Fertilidade", "Gestação", "Parto", "Maternidade", "Filhotes"],
  },
  {
    title: "Gestão",
    description: "Financeiro, indicadores e planejamento para criadores.",
    modules: ["Financeiro", "Fluxo caixa", "Custos", "Precificação", "Indicadores", "Planejamento"],
  },
  {
    title: "Marketing",
    description: "Posicionamento, atendimento, conteúdo e crescimento de marca.",
    modules: ["Instagram", "Branding", "Fotografia", "Reels", "Anúncios", "Posicionamento", "Atendimento"],
  },
  {
    title: "Administrativo",
    description: "Documentação, CNPJ, contratos, tributação e nota fiscal.",
    modules: ["CNPJ", "Contratos", "Tributação", "Nota fiscal", "Documentação"],
  },
  {
    title: "Bem-estar e Ética",
    description: "Qualidade de vida, aposentadoria, socialização e responsabilidade.",
    modules: ["Criação responsável", "Aposentadoria matrizes", "Enriquecimento", "Socialização", "Qualidade de vida"],
  },
  {
    title: "Biblioteca",
    description: "Modelos, checklists, planilhas e cronogramas para uso prático.",
    modules: ["Contratos", "Checklists", "Planilhas", "Modelos", "Cronogramas"],
  },
];

const ACADEMY_DEFAULT_PLANS = [
  {
    name: "Gratuito",
    description: "Acesso aos conteúdos abertos e materiais introdutórios.",
    priceCents: 0,
    billingCycle: "FREE",
    accessLevel: ACADEMY_LEVELS.VISITOR,
    featured: false,
    features: ["Conteúdos introdutórios", "Biblioteca aberta", "Newsletter educacional"],
  },
  {
    name: "Mensal",
    description: "Acesso contínuo à trilha principal da Academy.",
    priceCents: 9900,
    billingCycle: "MONTHLY",
    accessLevel: ACADEMY_LEVELS.STUDENT,
    featured: false,
    features: ["Aulas premium", "Favoritos", "Progresso do aluno"],
  },
  {
    name: "Anual",
    description: "Melhor custo-benefício para evolução estruturada durante o ano.",
    priceCents: 99000,
    billingCycle: "YEARLY",
    accessLevel: ACADEMY_LEVELS.STUDENT,
    featured: true,
    features: ["Aulas premium", "Biblioteca", "Atualizações de conteúdo"],
  },
  {
    name: "Premium",
    description: "Plano completo para criadores que desejam formação aprofundada.",
    priceCents: 14900,
    billingCycle: "MONTHLY",
    accessLevel: ACADEMY_LEVELS.PREMIUM,
    featured: false,
    features: ["Aulas premium", "Conteúdos avançados", "Estrutura para certificados futuros"],
  },
];

async function seedAcademyFoundation(prisma) {
  let categoriesCreated = 0;
  let modulesCreated = 0;
  let plansCreated = 0;

  for (const [categoryIndex, categoryData] of ACADEMY_FOUNDATION.entries()) {
    const categorySlug = slugify(categoryData.title);
    const existingCategory = await prisma.academyCategory.findUnique({ where: { slug: categorySlug } });
    const category = await prisma.academyCategory.upsert({
      where: { slug: categorySlug },
      create: {
        title: categoryData.title,
        slug: categorySlug,
        description: categoryData.description,
        sortOrder: (categoryIndex + 1) * 10,
        published: true,
      },
      update: {
        title: categoryData.title,
        description: categoryData.description,
        sortOrder: (categoryIndex + 1) * 10,
        published: true,
      },
    });
    if (!existingCategory) categoriesCreated += 1;

    for (const [moduleIndex, moduleTitle] of categoryData.modules.entries()) {
      const moduleSlug = slugify(`${categoryData.title}-${moduleTitle}`);
      const existingModule = await prisma.academyModule.findUnique({ where: { slug: moduleSlug } });
      await prisma.academyModule.upsert({
        where: { slug: moduleSlug },
        create: {
          categoryId: category.id,
          title: moduleTitle,
          slug: moduleSlug,
          description: `Conteúdo em preparação: ${moduleTitle}.`,
          level: ACADEMY_LEVELS.STUDENT,
          sortOrder: (moduleIndex + 1) * 10,
          published: true,
        },
        update: {
          categoryId: category.id,
          title: moduleTitle,
          sortOrder: (moduleIndex + 1) * 10,
          published: true,
        },
      });
      if (!existingModule) modulesCreated += 1;
    }
  }

  for (const planData of ACADEMY_DEFAULT_PLANS) {
    const planSlug = slugify(planData.name);
    const existingPlan = await prisma.academyPlan.findUnique({ where: { slug: planSlug } });
    await prisma.academyPlan.upsert({
      where: { slug: planSlug },
      create: {
        name: planData.name,
        slug: planSlug,
        description: planData.description,
        priceCents: planData.priceCents,
        billingCycle: planData.billingCycle,
        accessLevel: planData.accessLevel,
        featured: planData.featured,
        active: true,
        featuresJson: JSON.stringify(planData.features),
      },
      update: {
        description: planData.description,
        priceCents: planData.priceCents,
        billingCycle: planData.billingCycle,
        accessLevel: planData.accessLevel,
        featured: planData.featured,
        active: true,
        featuresJson: JSON.stringify(planData.features),
      },
    });
    if (!existingPlan) plansCreated += 1;
  }

  return { categoriesCreated, modulesCreated, plansCreated };
}

module.exports = {
  ACADEMY_FOUNDATION,
  ACADEMY_DEFAULT_PLANS,
  seedAcademyFoundation,
};
