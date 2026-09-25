# Guia: back-end com Prisma + PostgreSQL

Este guia substitui o `GUIA-VSCODE-E-SUPABASE.md` (que ficou desatualizado —
o projeto trocou o Supabase pelo **Prisma + PostgreSQL**). Se alguém achar
o arquivo antigo, pode apagar ou ignorar.

Este guia tem três partes:

1. **Parte 1** — rodar o front-end no VSCode (não muda nada em relação a
   antes).
2. **Parte 2** — criar o back-end do zero: Node.js + Express + Prisma +
   PostgreSQL, com o schema do banco e os endpoints que o front-end espera.
3. **Parte 3** — conectar o front-end à API de verdade, trocando o
   `src/lib/db.js`.

---

## Parte 1 — Rodando o front-end no VSCode

(Igual a sempre — o front-end funciona sozinho, com dados no navegador, até
o back-end da Parte 2 estar pronto.)

```bash
npm install
npm run dev
```

Login de teste: **admin** / **admin123**.

---

## Parte 2 — Criando o back-end (Prisma + PostgreSQL)

### 1. Instalar o PostgreSQL

- Baixe em https://www.postgresql.org/download/ (ou use Docker, se preferir:
  `docker run --name crediario-db -e POSTGRES_PASSWORD=senha123 -e POSTGRES_DB=crediario -p 5432:5432 -d postgres:16`).
- Anote usuário, senha, host, porta e nome do banco — vai precisar deles na
  "connection string" do Prisma.

### 2. Criar o projeto do back-end

Crie uma pasta **separada** do front-end (ex.: `crediario-api`, do lado de
fora da pasta `crediario-digital`):

```bash
mkdir crediario-api
cd crediario-api
npm init -y
npm install express cors dotenv bcryptjs jsonwebtoken
npm install -D prisma nodemon
npx prisma init
```

Isso cria uma pasta `prisma/` com o arquivo `schema.prisma` e um `.env`.

### 3. Configurar a conexão com o banco

No `.env` gerado, ajuste a linha `DATABASE_URL`:

```
DATABASE_URL="postgresql://usuario:senha@localhost:5432/crediario?schema=public"
JWT_SECRET="troque-por-uma-frase-secreta-bem-longa-e-aleatoria"
PORT=3000
```

### 4. O schema do Prisma

Substitua o conteúdo de `prisma/schema.prisma` por este — os nomes de campo
já batem com o que o front-end espera (em português), então não precisa
traduzir nada depois:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Papel {
  administrador
  funcionario
}

model Usuario {
  id     String @id @default(uuid())
  nome   String
  email  String @unique
  senha  String // hash (bcrypt), nunca texto puro
  papel  Papel  @default(funcionario)
}

model Cliente {
  id                  String        @id @default(uuid())
  nome                String
  cpf                 String?
  telefone            String?
  observacoes         String?
  status              String        @default("ativo")
  // Valor fixo de honorário — só o administrador pode ver/editar isso.
  // Essa regra é aplicada NA API (não manda o campo pra quem não for admin).
  honorarioEscritorio Decimal       @default(0) @db.Decimal(12, 2)
  criadoEm            DateTime      @default(now())
  propriedades        Propriedade[]
  debitos             Debito[]
  notinhas            Notinha[]
  historico           Historico[]
}

model Propriedade {
  id        String  @id @default(uuid())
  clienteId String
  cliente   Cliente @relation(fields: [clienteId], references: [id], onDelete: Cascade)
  nome      String
  documento String?
  status    String  @default("ativo")
  debitos   Debito[]
}

model Notinha {
  id                 String      @id @default(uuid())
  numeroSequencial   Int         @default(autoincrement())
  clienteId          String
  cliente            Cliente     @relation(fields: [clienteId], references: [id])
  competencia        String
  observacoes        String?
  total              Decimal     @db.Decimal(12, 2)
  status             String      @default("ativa") // ativa | paga | estornada
  creditoAdiantado   Decimal     @default(0) @db.Decimal(12, 2)
  creditoPixPendente Decimal     @default(0) @db.Decimal(12, 2)
  criadoEm           DateTime    @default(now())
  criadoPor          String?
  debitos            Debito[]
  pagamentos         Pagamento[]
}

model Debito {
  id                 String       @id @default(uuid())
  clienteId          String
  cliente            Cliente      @relation(fields: [clienteId], references: [id])
  propriedadeId      String?
  propriedade        Propriedade? @relation(fields: [propriedadeId], references: [id])
  descricao          String
  valor              Decimal      @db.Decimal(12, 2)
  competencia        String
  observacao         String?
  status             String       @default("aberto") // aberto | cobrado | pago | cancelado
  notinhaId          String?
  notinha            Notinha?     @relation(fields: [notinhaId], references: [id])
  competenciaNotinha String?
  pixPendente        Boolean      @default(false)
  formaPagamento     String?
  dataPagamento      DateTime?
  obsPagamento       String?
  criadoEm           DateTime     @default(now())
  criadoPor          String?
  atualizadoEm       DateTime     @updatedAt
}

model Pagamento {
  id         String    @id @default(uuid())
  notinhaId  String
  notinha    Notinha   @relation(fields: [notinhaId], references: [id], onDelete: Cascade)
  valor      Decimal   @db.Decimal(12, 2)
  forma      String
  data       DateTime?
  obs        String?
  tipo       String    // total | parcial
  pix        Boolean   @default(false)
  confirmado Boolean   @default(true)
  criadoEm   DateTime  @default(now())
}

model Historico {
  id            String   @id @default(uuid())
  quando        DateTime @default(now())
  entidade      String
  entidadeId    String?
  entidadeLabel String?
  acao          String
  operador      String?
  detalhes      String?
  clienteId     String?
  cliente       Cliente? @relation(fields: [clienteId], references: [id])
}
```

### 5. Rodar a primeira migração

```bash
npx prisma migrate dev --name inicial
```

Isso cria as tabelas de verdade no PostgreSQL. Sempre que mudar o
`schema.prisma`, rode `npx prisma migrate dev --name algum-nome` de novo.

### 6. Criar o primeiro usuário administrador

Crie um arquivo `prisma/seed.js`:

```js
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const prisma = new PrismaClient()

async function main() {
  const senhaHash = await bcrypt.hash('admin123', 10)
  await prisma.usuario.upsert({
    where: { email: 'admin@escritorio.com' },
    update: {},
    create: { nome: 'Administrador', email: 'admin@escritorio.com', senha: senhaHash, papel: 'administrador' },
  })
}

main().finally(() => prisma.$disconnect())
```

Rode com `node prisma/seed.js`.

### 7. Montar a API (Express)

Crie `src/index.js` (estrutura mínima — dá pra separar em mais arquivos
depois, mas isso já funciona):

```js
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { PrismaClient } = require('@prisma/client')
require('dotenv').config()

const prisma = new PrismaClient()
const app = express()
app.use(cors())
app.use(express.json())

// --- Autenticação -----------------------------------------------------
app.post('/auth/login', async (req, res) => {
  const { email, senha } = req.body
  const usuario = await prisma.usuario.findUnique({ where: { email } })
  if (!usuario || !(await bcrypt.compare(senha, usuario.senha))) {
    return res.status(401).json({ erro: 'Login ou senha inválidos.' })
  }
  const token = jwt.sign({ id: usuario.id, papel: usuario.papel }, process.env.JWT_SECRET, { expiresIn: '8h' })
  res.json({ token, usuario: { id: usuario.id, nome: usuario.nome, papel: usuario.papel } })
})

// Middleware: exige login válido em todas as rotas abaixo.
function exigirLogin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ erro: 'Não autenticado.' })
  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ erro: 'Sessão expirada, faça login de novo.' })
  }
}

// Middleware: só deixa passar administrador (Dashboard, Histórico,
// Conferir Pix, restaurar backup).
function exigirAdministrador(req, res, next) {
  if (req.usuario?.papel !== 'administrador') return res.status(403).json({ erro: 'Só o administrador pode fazer isso.' })
  next()
}

app.use(exigirLogin) // tudo daqui pra baixo exige login

// --- Clientes -----------------------------------------------------------
app.get('/clientes', async (req, res) => {
  const { busca = '', status = 'todos' } = req.query
  const clientes = await prisma.cliente.findMany({
    where: {
      ...(status !== 'todos' && { status }),
      ...(busca && { OR: [{ nome: { contains: busca, mode: 'insensitive' } }, { cpf: { contains: busca } }] }),
    },
    orderBy: { nome: 'asc' },
  })
  // Honorário só aparece pra administrador.
  const ehAdmin = req.usuario.papel === 'administrador'
  res.json(clientes.map((c) => (ehAdmin ? c : { ...c, honorarioEscritorio: undefined })))
})

app.post('/clientes', async (req, res) => {
  const dados = { ...req.body }
  if (req.usuario.papel !== 'administrador') delete dados.honorarioEscritorio
  const cliente = await prisma.cliente.create({ data: dados })
  res.status(201).json(cliente)
})

// ... siga o mesmo padrão pra débitos, notinhas, propriedades, histórico
// (a lista completa de rotas necessárias está na seção "Contrato da API"
// mais abaixo).

// --- Rotas só de administrador ------------------------------------------
app.get('/pix-pendentes', exigirAdministrador, async (req, res) => {
  // ver a seção "A lógica de pagamento" abaixo antes de implementar essa rota
})
app.get('/dashboard', exigirAdministrador, async (req, res) => { /* ... */ })
app.get('/historico', exigirAdministrador, async (req, res) => { /* ... */ })
app.post('/backup/restaurar', exigirAdministrador, async (req, res) => { /* ... */ })

app.listen(process.env.PORT, () => console.log(`API rodando na porta ${process.env.PORT}`))
```

Rode com `npx nodemon src/index.js`.

### 8. Contrato da API — lista completa de rotas que o front-end espera

Isso é o "de-para" entre as funções de `src/lib/db.js` (front-end) e os
endpoints que precisam existir na API:

| Função em `db.js`              | Rota sugerida                          |
|---------------------------------|------------------------------------------|
| `entrar`                        | `POST /auth/login`                       |
| `sair`                          | `POST /auth/logout` (opcional, JWT é stateless) |
| `usuarioAtual`                  | `GET /auth/me`                           |
| `listarClientes`                | `GET /clientes?busca=&status=`           |
| `buscarClientePorId`            | `GET /clientes/:id`                      |
| `buscarClientesPorNome`         | `GET /clientes/buscar-por-nome?texto=`   |
| `criarCliente`                  | `POST /clientes`                         |
| `atualizarCliente`              | `PATCH /clientes/:id`                    |
| `listarPropriedades`            | `GET /clientes/:id/propriedades?apenasAtivas=` |
| `criarPropriedade`              | `POST /clientes/:id/propriedades`        |
| `atualizarPropriedade`          | `PATCH /propriedades/:id`                |
| `listarDebitos`                 | `GET /debitos?clienteId=&status=&competencia=&busca=` |
| `criarDebito`                   | `POST /debitos`                          |
| `criarDebitosEmGrupo`           | `POST /debitos/lote`                     |
| `editarDebito`                  | `PATCH /debitos/:id`                     |
| `cancelarDebito`                | `POST /debitos/:id/cancelar`             |
| `marcarPagoDinheiro`            | `POST /debitos/:id/pagar-dinheiro`       |
| `marcarPagoPix`                 | `POST /debitos/:id/pagar-pix`            |
| `confirmarPix`                  | `POST /debitos/:id/confirmar-pix`        |
| `confirmarPixEmLote`            | `POST /debitos/confirmar-pix-lote`       |
| `confirmarCreditoPixNotinha`    | `POST /notinhas/:id/confirmar-credito-pix` |
| `alterarStatusDebito`           | `POST /debitos/:id/alterar-status`       |
| `listarPixPendentes`            | `GET /pix-pendentes` *(só admin)*        |
| `listarNotinhas`                | `GET /notinhas?busca=&competencia=&status=` |
| `buscarNotinhaPorId`            | `GET /notinhas/:id`                      |
| `criarNotinha`                  | `POST /notinhas`                         |
| `atualizarNotinha`              | `PATCH /notinhas/:id`                    |
| `adicionarDebitosNaNotinha`     | `POST /notinhas/:id/adicionar-debitos`   |
| `pagarNotinhaTotalDinheiro`     | `POST /notinhas/:id/pagar-tudo-dinheiro` |
| `pagarNotinhaTotalPix`          | `POST /notinhas/:id/pagar-tudo-pix`      |
| `pagarNotinhaParcial`           | `POST /notinhas/:id/pagar-parcial`       |
| `estornarNotinha`               | `POST /notinhas/:id/estornar`            |
| `reabrirNotinha`                | `POST /notinhas/:id/reabrir`             |
| `listarHistorico`               | `GET /historico?entidade=&operador=` *(só admin)* |
| `listarHistoricoDoCliente`      | `GET /clientes/:id/historico`            |
| `listarHistoricoDaNotinha`      | `GET /notinhas/:id/historico`            |
| `obterMetricasDashboard`        | `GET /dashboard?competencia=` *(só admin)* |
| `buscaGlobal`                   | `GET /busca?texto=`                      |
| `obterDadosParaExportacao`      | `GET /backup/exportar-detalhado`         |
| `exportarBackupCompleto`        | `GET /backup/exportar`                   |
| `restaurarBackupCompleto`       | `POST /backup/restaurar` *(só admin)*    |

### 9. ⚠️ A parte mais importante: a lógica de pagamento das notinhas

Essa é a parte que mais dá erro se for reimplementada do zero sem entender
as regras. **Antes de escrever os endpoints de pagamento, leia com calma o
arquivo `src/lib/db.js` do front-end** — em especial estas funções, que já
foram testadas e corrigidas com base no uso real:

- **`paraNotinhaPublica`** — a fórmula de "quanto já foi pago", "quanto está
  aguardando Pix" e "quanto ainda falta". Essa conta precisa ser feita do
  mesmo jeito no back-end (de preferência, calculada sempre na hora, nunca
  guardada "pronta" em uma coluna, pra nunca desincronizar).
- **`pagarNotinhaParcial`** — o valor pago é abatido dos itens em ordem
  cronológica; o que sobra sem fechar um item inteiro vira um "crédito"
  guardado na notinha (`creditoAdiantado` para dinheiro, `creditoPixPendente`
  para Pix — são dois "potes" separados, porque um já está confirmado e o
  outro ainda não).
- **`pagarNotinhaTotalDinheiro` / `pagarNotinhaTotalPix`** — column dessas
  duas funções tem um detalhe importante: se já existia um crédito de um
  pagamento parcial anterior, o valor novo cobrado é só a **diferença**
  (total dos itens menos o crédito já existente) — já tivemos um bug aqui em
  que o valor ficava contado em dobro, por isso o cuidado extra.
  Pix nunca fecha o débito na hora — sempre marca como "aguardando
  conferência" (`pixPendente = true`), só virando "pago" quando confirmado.
- **`alterarStatusDebito`** — permite corrigir manualmente um débito que já
  foi cobrado/pago (voltar para aberto, cobrado, ou pago). Quando o alvo é
  "pago via Pix", **não fecha na hora** — vai para a fila de conferência
  igual qualquer outro Pix. Se o débito pertence a uma notinha que já estava
  "paga", ela volta sozinha pra "ativa".
- **`listarPixPendentes`** — quando **todos** os itens de uma notinha estão
  aguardando confirmação de Pix ao mesmo tempo, eles devem aparecer
  **agrupados numa linha só** na tela de conferência (em vez de um item por
  linha) — com um botão que confirma tudo de uma vez
  (`confirmarPixEmLote`). Se sobrou algum "crédito Pix" que não fechou
  nenhum item inteiro, ele aparece como uma linha própria.

Recomendo fortemente **traduzir essas funções quase linha por linha** para
dentro dos endpoints Prisma, trocando os `Array.filter`/`.find` por
`prisma.debito.findMany`/`update`, em vez de tentar reinventar a lógica do
zero.

### 10. Segurança: onde as regras de permissão precisam valer de verdade

No front-end, esconder um botão ou uma aba do menu é só cosmético — qualquer
pessoa com um pouco de conhecimento técnico conseguiria acessar a rota
direto. Por isso, **essas regras precisam ser aplicadas na API** (com o
middleware `exigirAdministrador` do exemplo acima):

- `GET /dashboard`, `GET /historico`, `GET /pix-pendentes`,
  `POST /backup/restaurar` → só administrador.
- O campo `honorarioEscritorio` do cliente → só deve ir na resposta da API
  quando quem pediu é administrador (removido antes de responder, como no
  exemplo do endpoint `GET /clientes` acima).

---

## Parte 3 — Conectando o front-end à API de verdade

Quando a API estiver no ar, o trabalho é só no arquivo
**`src/lib/db.js`** — nenhuma tela do React precisa mudar, porque todas elas
só conhecem os nomes das funções exportadas de lá.

### 1. Variável de ambiente

Crie um arquivo `.env` na raiz do projeto do front-end

### 2. Um pequeno "cliente HTTP" para centralizar as chamadas

Crie `src/lib/apiClient.js`:

```js
const BASE_URL = import.meta.env.VITE_API_URL

function pegarToken() {
  return localStorage.getItem('crediario_token')
}

export async function api(caminho, opcoes = {}) {
  const resposta = await fetch(`${BASE_URL}${caminho}`, {
    ...opcoes,
    headers: {
      'Content-Type': 'application/json',
      ...(pegarToken() && { Authorization: `Bearer ${pegarToken()}` }),
      ...opcoes.headers,
    },
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
  })
  const dados = await resposta.json().catch(() => null)
  if (!resposta.ok) throw new Error(dados?.erro || 'Erro ao falar com o servidor.')
  return dados
}
```

### 3. Trocar as funções do `db.js`, uma de cada vez

Exemplo com duas funções reais, pra você replicar o padrão nas outras:

```js
// ANTES (localStorage)
export async function listarClientes({ busca = '', status = 'todos' } = {}) {
  await tick()
  return banco.clientes.filter(/* ... */).map(paraClientePublico)
}

// DEPOIS (API com Prisma por trás)
import { api } from './apiClient.js'

export async function listarClientes({ busca = '', status = 'todos' } = {}) {
  const parametros = new URLSearchParams({ busca, status })
  return api(`/clientes?${parametros}`)
}
```

```js
// ANTES
export async function criarCliente({ nome, cpf, telefone, observacoes }) {
  await tick()
  // ...cria no banco local
}

// DEPOIS
export async function criarCliente(dados) {
  return api('/clientes', { method: 'POST', body: dados })
}
```

E o login:

```js
export async function entrar(email, senha) {
  const { token, usuario } = await api('/auth/login', { method: 'POST', body: { email, senha } })
  localStorage.setItem('crediario_token', token)
  return usuario
}

export async function sair() {
  localStorage.removeItem('crediario_token')
}
```

Migre **uma função de cada vez** (comece por clientes, depois débitos,
depois notinhas, por último histórico/dashboard), testando a tela
correspondente a cada passo.

---

## Resumo rápido

| O que | Onde |
|---|---|
| Rodar o front-end local | `npm install` + `npm run dev` (na pasta do React) |
| Criar o back-end | pasta separada, `npm init` + Express + Prisma |
| Schema do banco | `prisma/schema.prisma` (Parte 2, passo 4) |
| Migração | `npx prisma migrate dev --name inicial` |
| Lista de rotas necessárias | Parte 2, passo 8 (tabela de-para) |
| Regra de negócio mais delicada | Parte 2, passo 9 — ler `db.js` com calma |
| Trocar dados de mentira por reais | `src/lib/db.js` (front-end), Parte 3 |
| Chave da API no front-end | `.env` → `VITE_API_URL` |