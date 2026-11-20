# Publicação e sessões

Execute `npm run publicar` para validar o projeto, executar os testes, adicionar as alterações, criar um commit com data e hora e fazer push. Uma mensagem própria pode ser usada: `npm run publicar -- "26.11-002"`.

O comando inclui todas as alterações da pasta do projeto, como `git add .`. Se uma validação falhar, a publicação para nesse ponto. Se o push falhar, o commit permanece local para uma nova tentativa. Executar novamente sem novas alterações tenta o push dos commits existentes.

## Render (configuração única)

No serviço já existente, em Settings, confira:

- Build Command: `npm ci && npx prisma generate`
- Start Command: `npm start`
- Auto-Deploy: `On Commit`, na mesma branch para a qual você faz push.

O script `prestart` aplica `prisma migrate deploy` antes de iniciar a aplicação. Não é necessário executar as migrações manualmente depois do push. Se a migração falhar, a nova versão não inicia. O Prisma CLI faz parte das dependências de produção.

As configurações do painel Render não são alteradas por estes arquivos. O comando local não confirma se o deploy no Render terminou; acompanhe o status em Deploys. O funcionamento de Auto-Deploy depende da conexão do repositório ao Render.

## Login durante as atualizações

As sessões ficam no PostgreSQL por sete dias de inatividade, com renovação a cada acesso. Reiniciar ou publicar a aplicação preserva a sessão. O logout remove a sessão do banco. As telas autenticadas não são armazenadas no cache: após a publicação terminar, navegar para outra função carrega a versão nova.

Se `SESSION_SECRET` estiver configurado no servidor, mantenha seu valor nas próximas publicações. Se não estiver, a aplicação cria uma chave aleatória e persistente na tabela de configurações, sem exigir configuração manual.

A primeira publicação dessa mudança pode exigir login novamente, pois as sessões antigas estavam apenas na memória do processo. A proteção passa a valer para os logins feitos com a versão nova. Alterar a chave de sessão, limpar cookies ou completar sete dias sem acesso também exige novo login.

Formulários já abertos não são recarregados automaticamente. Atualizações ainda podem ter uma breve indisponibilidade, dependendo da hospedagem, especialmente com disco persistente; isso é separado da preservação do login.
