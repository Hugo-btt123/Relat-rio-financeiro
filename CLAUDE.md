# Caderno Digital / Crediário Digital — Back-end

> Este arquivo é a fonte de verdade do projeto para qualquer sessão do Claude
> Code. Leia inteiro antes de escrever qualquer código, mesmo em sessões
> seguintes. Se alguma instrução do roteiro da disciplina (Paradigmas de
> Programação II, Uni-FACEF) contradisser algo aqui em **arquitetura/padrão de
> pastas/versão de biblioteca**, siga o roteiro. Se contradisser algo em
> **regra de negócio** (status, cálculo de dinheiro, permissão), pare e
> pergunte antes de mudar — não decida sozinho.

## 0. Contexto

Back-end para o front-end React já pronto (pasta `Front - CADERNO DIGITAL`,
que precisa ser copiada para `front-end/` neste repositório — veja seção 1).
O front-end guarda os dados em `localStorage` hoje; este back-end substitui
isso por Node.js + Prisma + PostgreSQL, sem que nenhuma tela do React precise
mudar (elas só conhecem os nomes das funções de `src/lib/db.js`).

Este é um projeto de estudo da disciplina **Paradigmas de Programação II**
(4º sem. CC/SI, Uni-FACEF). O roteiro oficial da disciplina está em
`github.com/faustocintra/pp2-cs4-2026-2` (o aluno tem um fork em
`github.com/Hugobatista123/pp2-cs4-2026-2`, com um exemplo já corrigido de
CRUD simples — cadastro de clientes "Karangos"). **Todas as convenções de
arquitetura, versão de biblioteca e estilo deste documento foram extraídas
diretamente desse fork** — não são um palpite. Onde o exemplo do professor
não cobre algo (autenticação, relações, transações, enums), segui o padrão
dele extrapolado com bom senso, e marquei como "decisão própria" onde relevante.

## 1. Antes de começar: arquivos que precisam existir neste repositório

Este repositório (`Relat-rio-financeiro` / `Relatório-financeiro`) ainda não
tem essas referências — copie-as para cá antes de rodar qualquer coisa:

```
front-end/                          <- conteúdo inteiro do zip "Front - CADERNO DIGITAL"
  src/lib/db.js                     <- ESPECIFICAÇÃO EXECUTÁVEL das regras de negócio
  CONTRATO-BACKEND-IA.md            <- regras de negócio em prosa (já existe, ok, mas com 2 pontos desatualizados: ver seção 6)
  GUIA-VSCODE-E-PRISMA.md           <- lista de rotas (ok, mas schema/versão do Prisma sugeridos ali estão desatualizados: ver seção 6)
```

Se o `db.js` e este `CLAUDE.md` divergirem em algum detalhe fino de regra de
negócio (não de arquitetura), o `db.js` manda — ele foi testado manualmente
contra vários cenários reais, este arquivo é um resumo.

## 2. Stack (confirmada contra o fork do professor, não é opinião)

- **Node.js 24**, TypeScript estrito (`strict: true`), ESM com
  `module`/`moduleResolution: NodeNext`, target `ES2023`.
- **Express 5**.
- **Prisma 7** com driver adapter — `@prisma/adapter-pg` + pacote `pg`, NÃO
  a engine clássica (`prisma-client-js`). Client gerado em `generated/prisma`
  (fora de `src/`, incluído no `tsconfig.json` via `include`).
- Config do Prisma em `prisma.config.ts` (Prisma 7) — o `datasource` do
  `schema.prisma` **não** tem `url =`; a connection string vem do
  `prisma.config.ts` (via `dotenv/config`) e do adapter no client em runtime.
- **PostgreSQL**.
- Testes: **test runner nativo do Node** (`node --test`), rodando HTTP real
  contra um Postgres de teste — sem Jest/Mocha/Vitest.
- Dependências equivalentes às do fork: `express`, `cors` ou
  `cookie-parser` + `morgan`, `dotenv`, `pg`, `@prisma/adapter-pg`,
  `@prisma/client`; dev: `prisma`, `typescript`, `tsx`, `rimraf`,
  `eslint`, `prettier`, tipos `@types/*`.
- Extras necessários que o roteiro do professor ainda não usa (autenticação):
  `bcryptjs`, `jsonwebtoken` (ou `jose`), `cookie-parser`.

### Arquitetura em camadas (idêntica ao fork)

```
routes → controllers → services → repositories → Prisma Client → PostgreSQL
```

### Estrutura de pastas

```
back-end/
  .env.example              DATABASE_URL="" / PORT=8888 / JWT_SECRET=""
  prisma.config.ts
  prisma/
    schema.prisma
    migrations/
  src/
    app.ts
    bin/server.ts
    database/client.ts      instancia PrismaClient com PrismaPg adapter
    dto/
      cliente/  propriedade/  debito/  notinha/  pagamento/  usuario/
    errors/
      AppError.ts  NotFoundError.ts  ConflictError.ts
      ValidationError.ts  ForbiddenError.ts  UnauthorizedError.ts
    middlewares/
      errorHandler.ts
      auth.ts                exigirLogin / exigirAdministrador
    controllers/
      clienteController.ts  propriedadeController.ts  debitoController.ts
      notinhaController.ts  authController.ts  dashboardController.ts
      historicoController.ts  buscaController.ts  backupController.ts
    services/
      clienteService.ts  propriedadeService.ts  debitoService.ts
      notinhaService.ts  notinhaPagamentoService.ts  authService.ts
      dashboardService.ts  historicoService.ts  buscaService.ts  backupService.ts
    repositories/
      (um por entidade, mesmo padrão do customerRepository.ts do fork)
    routes/
      index.ts  clientes.ts  propriedades.ts  debitos.ts  notinhas.ts
      auth.ts  dashboard.ts  historico.ts  busca.ts  backup.ts
    types/error.ts
  test/
    *.test.ts
```

## 3. `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum Papel {
  administrador
  funcionario
}

enum StatusDebito {
  aberto
  cobrado
  pago
  cancelado
}

enum StatusNotinha {
  ativa
  paga
  estornada
}

model Usuario {
  id       Int      @id @default(autoincrement())
  nome     String
  login    String   @unique
  senha    String   // hash bcrypt, nunca texto puro
  papel    Papel    @default(funcionario)
  criadoEm DateTime @default(now())
}

model Cliente {
  id                  Int           @id @default(autoincrement())
  nome                String
  cpf                 String?
  telefone            String?
  observacoes         String?
  status              String        @default("ativo")
  honorarioEscritorio Decimal       @default(0) @db.Decimal(12, 2) // admin-only na API
  criadoEm            DateTime      @default(now())
  propriedades        Propriedade[]
  debitos             Debito[]
  notinhas            Notinha[]
  historico           Historico[]
}

model Propriedade {
  id        Int      @id @default(autoincrement())
  clienteId Int
  cliente   Cliente  @relation(fields: [clienteId], references: [id])
  nome      String
  documento String?
  status    String   @default("ativo")
  criadoEm  DateTime @default(now())
  debitos   Debito[]
}

model Notinha {
  id                 Int           @id @default(autoincrement()) // também usado como "numero" (#001) — ver seção 6
  clienteId          Int
  cliente            Cliente       @relation(fields: [clienteId], references: [id])
  competencia        String
  observacoes        String?
  total              Decimal       @db.Decimal(12, 2)
  status             StatusNotinha @default(ativa)
  creditoAdiantado   Decimal       @default(0) @db.Decimal(12, 2)
  creditoPixPendente Decimal       @default(0) @db.Decimal(12, 2)
  criadoEm           DateTime      @default(now())
  criadoPor          String?
  debitos            Debito[]
  pagamentos         Pagamento[]
}

model Debito {
  id                 Int          @id @default(autoincrement())
  clienteId          Int
  cliente            Cliente      @relation(fields: [clienteId], references: [id])
  propriedadeId      Int?
  propriedade        Propriedade? @relation(fields: [propriedadeId], references: [id])
  descricao          String
  valor              Decimal      @db.Decimal(12, 2)
  competencia        String
  observacao         String?
  status             StatusDebito @default(aberto)
  notinhaId          Int?
  notinha            Notinha?     @relation(fields: [notinhaId], references: [id])
  competenciaNotinha String?
  pixPendente        Boolean      @default(false)
  formaPagamento     String?
  dataPagamento      DateTime?    @db.Date
  obsPagamento       String?
  criadoEm           DateTime     @default(now())
  criadoPor          String?
  atualizadoEm       DateTime     @updatedAt
}

model Pagamento {
  id         Int       @id @default(autoincrement())
  notinhaId  Int
  notinha    Notinha   @relation(fields: [notinhaId], references: [id])
  valor      Decimal   @db.Decimal(12, 2)
  forma      String
  data       DateTime? @db.Date
  obs        String?
  tipo       String    // total | parcial
  pix        Boolean   @default(false)
  confirmado Boolean   @default(true)
  criadoEm   DateTime  @default(now())
}

model Historico {
  id            Int      @id @default(autoincrement())
  quando        DateTime @default(now())
  entidade      String
  entidadeId    String?  // String de propósito: às vezes não é FK de nada (ex.: "backup")
  entidadeLabel String?
  acao          String
  operador      String?
  detalhes      String?
  clienteId     Int?
  cliente       Cliente? @relation(fields: [clienteId], references: [id])
}
```

Decisões nesse schema que vale documentar:

- **Enums nativos** (`Papel`, `StatusDebito`, `StatusNotinha`) em vez de
  `String` solto — os valores do front (`aberto`, `cobrado`, `administrador`
  etc.) já batem exatamente com os nomes dos enums, então nenhuma tela
  precisa mudar. Serializam como string puro no JSON, igual uma coluna
  `String` faria.
- **Sem `onDelete: Cascade`** em lugar nenhum — nada no sistema é apagado de
  verdade (seção 6), então cascade de exclusão nunca deveria disparar; deixei
  o padrão do Postgres (Restrict) como rede de segurança.
- `dataPagamento` e `Pagamento.data` são `@db.Date` (só data, sem hora),
  igual ao `birth_date` do exemplo do professor.

## 4. Rotas

| Função equivalente em `db.js` | Método | Caminho |
|---|---|---|
| `entrar` | POST | `/auth/login` |
| `sair` | POST | `/auth/logout` |
| `usuarioAtual` | GET | `/auth/me` |
| `listarClientes` | GET | `/clientes?busca=&status=` |
| `buscarClientePorId` | GET | `/clientes/:id` |
| `buscarClientesPorNome` | GET | `/clientes/buscar-por-nome?texto=` |
| `criarCliente` | POST | `/clientes` |
| `atualizarCliente` | PATCH | `/clientes/:id` |
| `listarPropriedades` | GET | `/clientes/:id/propriedades?apenasAtivas=` |
| `criarPropriedade` | POST | `/clientes/:id/propriedades` |
| `atualizarPropriedade` | PATCH | `/propriedades/:id` |
| `listarDebitos` | GET | `/debitos?clienteId=&status=&competencia=&busca=&apenasPixPendente=` |
| `criarDebito` | POST | `/debitos` |
| `criarDebitosEmGrupo` | POST | `/debitos/lote` |
| `editarDebito` | PATCH | `/debitos/:id` |
| `cancelarDebito` | POST | `/debitos/:id/cancelar` |
| `marcarPagoDinheiro` | POST | `/debitos/:id/pagar-dinheiro` |
| `marcarPagoPix` | POST | `/debitos/:id/pagar-pix` |
| `confirmarPix` | POST | `/debitos/:id/confirmar-pix` |
| `confirmarPixEmLote` | POST | `/debitos/confirmar-pix-lote` |
| `confirmarCreditoPixNotinha` | POST | `/notinhas/:id/confirmar-credito-pix` |
| `alterarStatusDebito` | POST | `/debitos/:id/alterar-status` |
| `listarPixPendentes` | GET | `/pix-pendentes` *(admin)* |
| `listarNotinhas` | GET | `/notinhas?busca=&competencia=&status=` |
| `buscarNotinhaPorId` | GET | `/notinhas/:id` |
| `criarNotinha` | POST | `/notinhas` |
| `atualizarNotinha` | PATCH | `/notinhas/:id` |
| `adicionarDebitosNaNotinha` | POST | `/notinhas/:id/adicionar-debitos` |
| `pagarNotinhaTotalDinheiro` | POST | `/notinhas/:id/pagar-tudo-dinheiro` |
| `pagarNotinhaTotalPix` | POST | `/notinhas/:id/pagar-tudo-pix` |
| `pagarNotinhaParcial` | POST | `/notinhas/:id/pagar-parcial` |
| `estornarNotinha` | POST | `/notinhas/:id/estornar` |
| `reabrirNotinha` | POST | `/notinhas/:id/reabrir` |
| `listarHistorico` | GET | `/historico?entidade=&operador=` *(admin)* |
| `listarHistoricoDoCliente` | GET | `/clientes/:id/historico` |
| `listarHistoricoDaNotinha` | GET | `/notinhas/:id/historico` |
| `obterMetricasDashboard` | GET | `/dashboard?competencia=` *(admin)* |
| `buscaGlobal` | GET | `/busca?texto=` |
| `obterDadosParaExportacao` | GET | `/backup/exportar-detalhado` |
| `exportarBackupCompleto` | GET | `/backup/exportar` |
| `restaurarBackupCompleto` | POST | `/backup/restaurar` *(admin)* |

`POST /auth/login` recebe `{ login, senha }` — **não** `{ email, senha }`
(o `db.js` real usa campo `login`; um guia antigo do front sugeria e-mail,
está errado).

## 5. Autenticação e permissões

**Decisão própria** (o roteiro do professor ainda não cobre login): JWT
guardado em **cookie httpOnly** (não em `localStorage`/header `Authorization`)
— mais seguro contra XSS, e `cookie-parser` já é uma dependência natural
nesse ecossistema. Se o roteiro da disciplina especificar outro jeito mais
adiante, troque sem hesitar.

- `POST /auth/login`: valida `login`+`senha` (bcrypt.compare), assina JWT
  `{ id, papel }`, seta cookie httpOnly (`Set-Cookie`, `sameSite: 'lax'`,
  `secure` em produção), devolve `{ id, nome, papel }` no corpo (sem token).
- `POST /auth/logout`: limpa o cookie.
- `GET /auth/me`: lê o cookie, devolve o usuário ou `401`.
- Middleware `exigirLogin`: lê o cookie, valida JWT, popula `req.usuario`;
  sem cookie ou JWT inválido → `401`.
- Middleware `exigirAdministrador`: `req.usuario.papel !== 'administrador'`
  → `403`.
- Rotas **só admin**: `GET /dashboard`, `GET /historico`,
  `GET /pix-pendentes`, `POST /backup/restaurar`.
- `honorarioEscritorio`: **nunca** entra na resposta da API para quem não é
  administrador — remove o campo do objeto antes do `res.json` em toda rota
  que devolve `Cliente` (não é um "esconder no front", é removido de
  verdade). Funcionário também nunca pode enviar esse campo no
  `POST`/`PATCH` de cliente — a API ignora/remove o campo do body antes de
  passar para o Prisma.

## 6. Regras de negócio críticas (resumo — `db.js` é a fonte completa)

### Débito
`aberto → cobrado → pago`; `cancelado` a partir de `aberto` ou `cobrado`,
nunca apagado de verdade. Cancelar um débito de notinha **reduz** o `total`
dela. `alterarStatusDebito` permite correção manual entre qualquer status
(menos `cancelado`), mas alvo "pago via Pix" **nunca fecha na hora** — vira
`cobrado + pixPendente=true`, igual qualquer outro Pix, só virando `pago`
quando confirmado em `/debitos/:id/confirmar-pix`.

### Notinha
`ativa → paga`; `reabrir` só de `paga`, volta pra `ativa` mantendo os
débitos vinculados; `estornar` é definitivo e **remove os itens da lista da
notinha** (não só solta o vínculo do lado do débito — bug real do front, não
repetir). `numero` exibido = `#${String(id).padStart(3, '0')}` (id
substitui o antigo `numeroSequencial`, que foi removido do schema por ser
redundante — nenhuma tela do front usa o campo cru, só o `numero` já
formatado).

### Os dois "potes" de crédito
- `creditoAdiantado`: dinheiro **confirmado** que sobrou de um pagamento
  parcial sem fechar um item inteiro.
- `creditoPixPendente`: a mesma ideia, mas Pix ainda não conferido.

Pagamento parcial abate os itens **em ordem cronológica** (mais antigo
primeiro); um item só fecha quando o saldo disponível (crédito + valor novo)
cobre ele **por inteiro**; o resto vira crédito. **Nunca** aceitar parcial
maior que o saldo em aberto da notinha (rejeitar com `409`, pedindo "pagar
tudo"). "Pagar tudo" **desconta** o crédito que já existia antes de cobrar
o valor novo — contar sem descontar é dinheiro em dobro (bug real,
corrigido no front, não repetir no back). Pix "pagar tudo"/"parcial" nunca
fecha item na hora, sempre vai para a fila de conferência.

### Conferir Pix (`GET /pix-pendentes`)
Agrupa: se **todos** os itens de uma notinha estão com Pix pendente →
1 linha (`tipo: 'notinha'`) com botão de confirmar tudo
(`confirmarPixEmLote`). Se só parte → itens separados (`tipo: 'debito'`)
com anotação de quanto representam do total. Se sobrou crédito Pix que não
fechou nenhum item inteiro → **linha própria** (`tipo: 'credito-notinha'`,
confirmada via `confirmarCreditoPixNotinha`) — esse é o bug mais grave já
encontrado no front: um Pix pequeno demais fica invisível se essa linha for
esquecida.

### Outras regras que não podem se perder
- **Nada é `DELETE`.** Toda "exclusão" é mudança de status.
- Dinheiro: sempre `Decimal` no banco, nunca `Float`; arredondar a 2 casas
  **antes de persistir** (nunca deixar soma "crua" gravada).
- Competência: valida `^(0[1-9]|1[0-2])\/\d{4}$` no back-end também.
- Um débito nunca em duas notinhas ao mesmo tempo — ao criar/adicionar,
  revalidar que cada débito selecionado ainda está `aberto` e pertence ao
  cliente informado (outra pessoa pode ter cobrado ele entre o carregamento
  da tela e o clique).
- Honorário fixo do escritório: se marcado (`incluirHonorario`), cria um
  débito "Escritório" com o valor de `cliente.honorarioEscritorio` e já
  inclui na notinha nova.
- `paraNotinhaPublica` (o cálculo de "quanto já foi pago / aguardando Pix /
  ainda em aberto") deve ser **uma função única**, usada tanto no
  `GET /notinhas/:id` quanto dentro de qualquer transação de pagamento —
  nunca recalculado/duplicado em dois lugares.

## 7. Erros customizados (mesmo padrão do `AppError`/`NotFoundError` do fork)

```ts
// src/errors/AppError.ts (já existe no fork, replicar)
export class AppError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message)
    this.name = 'AppError'
  }
}
```

Criar também: `NotFoundError` (404), `ConflictError` (409),
`ValidationError` (400), `ForbiddenError` (403), `UnauthorizedError` (401) —
todas extends `AppError`, mesmo padrão de construtor.

`errorHandler` (mesmo lugar do fork, `src/middlewares/errorHandler.ts`)
deve continuar tratando, além de `AppError`:
`Prisma.PrismaClientKnownRequestError` (`P2002` → 409, `P2025` → 404,
`P2000`/`P2006`/`P2007`/`P2011` → 400), `Prisma.PrismaClientValidationError`
e `entity.parse.failed` → 400, e por fim `500` sem vazar detalhe interno.

## 8. Testes

Seguir exatamente o padrão de `back-end/test/customers.test.ts` do fork:
`node --test`, banco de teste separado via `TEST_DATABASE_URL`, HTTP real
(`app.listen(0)` + `fetch`), limpeza dos registros criados no `after`.
Cobrir no mínimo: CRUD de cliente, criação de débito + validação de
competência, ciclo completo débito→notinha→pagar tudo dinheiro, pagamento
parcial com crédito sobrando, Pix parcial com crédito "invisível"
(o bug da seção 6), estorno de notinha, e as permissões (funcionário
batendo em `/dashboard`, `/historico`, `/pix-pendentes` → `403`).

## 9. Ordem de implementação sugerida (commitar ao final de cada fase)

1. Scaffold do projeto (`package.json`, `tsconfig.json`,
   `prisma.config.ts`, `.env.example`) + `schema.prisma` da seção 3 +
   primeira migration + seed do usuário admin.
2. `app.ts`/`server.ts`/`database/client.ts`/`errors/`/`middlewares/errorHandler.ts`
   (esqueleto de infra, sem rota de negócio ainda).
3. Autenticação completa (`auth.ts` rotas + `middlewares/auth.ts`) +
   testes de login/permissão.
4. Cliente + Propriedade (CRUD simples, é o mais parecido com o exemplo do
   professor).
5. Débito (CRUD + todas as transições de status, inclusive
   `alterarStatusDebito`).
6. Notinha — criação, edição, adicionar débitos, estorno, reabrir (sem
   pagamento ainda).
7. **Pagamentos de notinha** (a parte mais delicada — seção 6): pagar tudo
   dinheiro, pagar tudo Pix, pagar parcial, confirmar Pix (individual, em
   lote, crédito solto). Escrever os testes dos cenários de bug da seção 6
   antes de considerar essa fase pronta.
8. Dashboard, histórico, busca global, backup (exportar/restaurar).
9. Revisão final: conferir que `honorarioEscritorio` realmente não vaza pra
   funcionário em nenhuma rota, rodar a suíte de testes inteira.

## 10. Setup de ambiente

```bash
cd back-end
npm install
npm install bcryptjs jsonwebtoken cookie-parser
npm install -D @types/bcryptjs @types/jsonwebtoken @types/cookie-parser
cp .env.example .env   # preencher DATABASE_URL, JWT_SECRET, PORT=8888
npx prisma migrate dev --name inicial
npm run dev
```

Para os testes, seguir o padrão do fork: banco de teste separado, variável
`TEST_DATABASE_URL`, nunca reaproveitar a conexão de desenvolvimento.