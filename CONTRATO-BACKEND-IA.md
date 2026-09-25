# Contrato de regras — Crediário Digital (front-end → back-end)

> **Para quem é este arquivo:** para você (ou uma IA te ajudando) ler ANTES de
> escrever qualquer código de back-end, e consultar de novo sempre que for
> mexer em alguma rota de pagamento, notinha ou permissão. Ele não ensina
> "como" construir a API (isso é o roteiro do professor) — ele descreve **o
> que o sistema precisa continuar fazendo**, exatamente como o front-end (já
> pronto, em React) espera que ele funcione.
>
> Se em algum ponto o roteiro da disciplina pedir uma estrutura de pastas,
> nome de arquivo ou padrão diferente do que está descrito aqui, **siga o
> professor** — isso aqui não é sobre arquitetura de pastas. O que não pode
> mudar são as **regras de negócio**: os status, os cálculos de dinheiro, as
> permissões e as transições descritas abaixo. Se uma IA de código sugerir
> uma mudança que contradiga algo deste documento, ela deve **perguntar
> antes**, não decidir sozinha.

## 0. Contexto rápido

- Sistema de "crediário digital" para um escritório de contabilidade:
  substitui o caderno de anotações + notinhas de papel que eles usavam.
- Front-end: **React + Vite + Bootstrap 5**, já 100% pronto (veja a pasta
  `src/`). Hoje ele guarda os dados no `localStorage` do navegador como um
  banco de dados provisório — **toda** a lógica que hoje está em
  `src/lib/db.js` precisa ser recriada no back-end, com o mesmo
  comportamento.
- Back-end (a construir): **Node.js + TypeScript + Express + Prisma +
  PostgreSQL**, seguindo o roteiro da disciplina (Paradigmas de Programação
  II). Camadas sugeridas: rotas → serviços → Prisma Client.
- `src/lib/db.js` é a **fonte da verdade executável** de todo esse
  documento — cada regra aqui embaixo tem uma função correspondente lá,
  com comentários em português explicando o "porquê". Na dúvida sobre
  algum detalhe fino, é lá que está a resposta definitiva.

## 1. Papéis de usuário

Dois papéis, sempre: **administrador** e **funcionário**.

| Área | Administrador | Funcionário |
|---|---|---|
| Essencial, Clientes, Notinhas | vê e mexe em tudo | vê e mexe em tudo |
| **Dashboard** | vê | **não vê** (bloquear rota, não só esconder botão) |
| **Histórico** | vê | **não vê** |
| **Conferir Pix** | vê | **não vê** |
| Backup — exportar (.json/.xlsx) | pode | pode |
| Backup — **restaurar** um .json | pode | **não pode** |
| Campo `honorarioEscritorio` do cliente | vê e edita | **nunca deve receber esse campo na resposta da API** |

⚠️ Isso precisa ser garantido **no back-end**, não só escondido na tela — um
funcionário mandando uma requisição direta pra essas rotas tem que tomar
`403`. Use um middleware de autorização por papel, aplicado nessas rotas
específicas.

## 2. Modelo de dados

Nomes de campo em português, batendo com o que o front-end já espera (evita
ter que traduzir nada na hora de plugar). Veja o `schema.prisma` sugerido no
`GUIA-VSCODE-E-PRISMA.md` (dentro do zip do front-end) — ele já está pronto
pra copiar. Resumo das entidades:

- **Usuario**: nome, email, senha (hash), papel (`administrador` | `funcionario`).
- **Cliente**: nome (obrigatório), cpf/cnpj (opcional, um campo só — o
  front-end formata sozinho se são 11 ou 14 dígitos), telefone, observações,
  status (`ativo`/`inativo`), **honorarioEscritorio** (decimal, admin-only).
- **Propriedade**: filial/imóvel de um cliente — nome, documento, status
  (`ativo`/`inativo`). Cliente pode ter zero, uma ou várias.
- **Débito**: a linha do "caderno". clienteId, propriedadeId (opcional),
  descrição livre, valor, competência (`MM/AAAA`), observação, **status**
  (`aberto` | `cobrado` | `pago` | `cancelado`), notinhaId (opcional),
  competenciaNotinha, **pixPendente** (booleano, independente do status),
  formaPagamento, dataPagamento, obsPagamento.
- **Notinha**: fatura que agrupa vários débitos de UM cliente. numeroSequencial
  (auto-incremento, sequencial, é o "#001" exibido), clienteId, competência,
  observações, total, status (`ativa` | `paga` | `estornada`),
  **creditoAdiantado**, **creditoPixPendente** (explicados na seção 4),
  lista de pagamentos.
- **Pagamento**: histórico de pagamentos (parciais ou totais) de uma
  notinha — valor, forma, data, obs, tipo (`total`/`parcial`), pix
  (booleano), confirmado (booleano).
- **Historico**: log de auditoria — quando, entidade, ação, operador,
  detalhes, clienteId. **Nada é apagado no sistema — toda ação vira uma
  linha aqui.**

## 3. Os dois "estados" que sustentam tudo

### 3.1 Status do **débito**

```
aberto ──► cobrado ──► pago
  │           │
  └────► cancelado ◄──┘   (cancelado pode vir de "aberto" OU "cobrado")
```

- **aberto**: acabou de ser lançado, ainda não foi pra nenhuma notinha.
- **cobrado**: ou (a) está dentro de uma notinha (`notinhaId` preenchido), ou
  (b) é um Pix avulso aguardando o contador confirmar no extrato
  (`pixPendente = true`, sem notinha). Repare: **`pixPendente` é um campo
  separado do `status`** — um débito "cobrado" pode ou não estar com Pix
  pendente.
- **pago**: confirmado de vez. Guarda forma de pagamento, data e observação
  (todos opcionais).
- **cancelado**: nunca é apagado, só marcado. Pode vir de "aberto" ou
  "cobrado". **Se o débito cancelado pertencia a uma notinha, o `total` da
  notinha precisa ser reduzido no mesmo valor** (isso já foi um bug real no
  front-end — veja a seção 6).

Além da transição "normal" pra frente, o sistema PRECISA permitir **correção
manual** (voltar um débito de `pago`/`cobrado` para um status anterior — é o
recurso "Alterar status / estornar" no front-end). Regras exatas:

- De **pago** → pode voltar para **aberto** ou **cobrado**.
  - Se estava numa notinha e volta pra "cobrado": continua vinculado à
    mesma notinha, só perde a marca de pago.
  - Se volta pra "aberto": **desvincula da notinha** (some do total dela).
  - Se não tinha notinha (pago avulso): "cobrado" aqui significa virar Pix
    a conferir de novo.
- De **cobrado** (com ou sem Pix pendente) → pode voltar para **aberto**,
  **pago (dinheiro)** ou **pago (Pix)**.
  - **Importante**: "pago (Pix)" NUNCA fecha na hora — sempre vira
    `cobrado + pixPendente = true`, indo pra fila de conferência, igual
    qualquer outro pagamento via Pix do sistema. Só "pago (dinheiro)" fecha
    na hora de verdade.
- Se o débito pertence a uma notinha e a alteração faz ela deixar de estar
  100% paga, **a notinha volta sozinha pro status "ativa"** (se estava
  "paga"). E se a alteração faz ela ficar 100% paga, ela fecha sozinha.
- Toda alteração assim gera **duas** linhas de histórico: uma no débito, uma
  na notinha (se ele pertencer a uma), explicando o que mudou.

### 3.2 Status da **notinha**

```
ativa ──► paga
  │
  └────► estornada
  
(de "paga" dá pra "reabrir", voltando pra "ativa")
```

- **ativa**: criada, ainda tem algo em aberto ou aguardando confirmação.
- **paga**: TODOS os itens não-cancelados estão com status `pago` de
  verdade (Pix confirmado conta; Pix pendente NÃO conta como pago ainda).
- **estornada**: todos os itens não-cancelados voltam pra "aberto" (perdem
  o vínculo — `notinhaId = null`) e **saem da lista de itens da notinha**
  (isso é importante — veja o bug #2 na seção 6). O `total` histórico da
  notinha **não muda** (fica registrado quanto ela valia).
- **Reabrir** (só de "paga" → "ativa"): desfaz o pagamento, mas os débitos
  **continuam vinculados** à notinha (viram "cobrado" de novo). Diferente
  de estornar.
- Uma notinha "estornada" não pode ser reaberta nem editada — é definitiva.

Além disso, existe um **status "de exibição"** que não é salvo no banco:
quando a notinha inteira foi paga via Pix mas ainda não foi confirmada, ela
deve **aparecer** como "Pix a conferir" pro usuário, mesmo que internamente
ainda esteja `ativa` (só vira `paga` de verdade após a confirmação).

## 4. Pagamentos — a parte mais delicada de tudo

Uma notinha pode ser paga de três jeitos: **tudo em dinheiro**, **tudo via
Pix**, ou **parcial** (dinheiro OU Pix).

### Os dois "potes" de crédito

- `creditoAdiantado`: dinheiro **já confirmado** que sobrou de um pagamento
  parcial sem fechar um item inteiro (ex.: notinha com dois itens de R$700
  e R$800; cliente paga R$500 parcial em dinheiro → nenhum item fecha, os
  R$500 ficam guardados aqui).
- `creditoPixPendente`: a mesma ideia, mas para dinheiro recebido via Pix
  que **ainda não foi conferido** no extrato.

### Regras de alocação (pagamento parcial)

1. O valor pago é abatido dos itens **em ordem cronológica** (mais antigo
   primeiro).
2. Um item só fecha (vira `pago`, se dinheiro; ou `pixPendente=true`, se
   Pix) quando o saldo disponível (crédito existente + valor novo) cobre
   ele **por inteiro**.
3. O que sobra sem fechar nenhum item vai pro pote de crédito
   correspondente (dinheiro → `creditoAdiantado`; Pix →
   `creditoPixPendente`).
4. **Nunca aceite um pagamento parcial maior do que o saldo em aberto da
   notinha.** Sobrepagar cria um crédito "sobrando" que não tem pra onde
   ir — rejeite com uma mensagem pedindo pra usar "pagar tudo" em vez
   disso. (Isso já foi um bug real — veja a seção 6.)

### "Pagar tudo"

- Fecha todos os itens que ainda estão simplesmente "cobrados" (ignora os
  que já estão com Pix pendente — esses só se resolvem confirmando).
- **Desconta qualquer crédito que já existia** antes de calcular o valor
  "novo" a registrar — cobrar o valor cheio de novo, ignorando o crédito
  já recebido, conta dinheiro em dobro. (Bug real corrigido — seção 6.)
- Ao final, o pote de crédito correspondente (`creditoAdiantado` ou
  `creditoPixPendente`) é zerado (foi todo absorvido nos itens agora
  fechados).

### Conferir Pix — a tela de confirmação

- Um pagamento via Pix **nunca** fecha o débito na hora — ele fica
  "aguardando conferência" até o contador confirmar contra o extrato.
- Se **todos** os itens de uma notinha ficarem com Pix pendente ao mesmo
  tempo, a tela de conferência deve **agrupar isso numa linha só**
  ("notinha inteira"), com um botão que confirma tudo de uma vez — não
  uma linha por item.
- Se só **parte** dos itens está com Pix pendente, mostrar cada um
  separado, mas com uma indicação de quanto isso representa do total da
  notinha (ex.: "R$700 de R$1.500 · pago parcialmente").
- **Crítico**: se o valor pago via Pix parcial não fechar nem o item mais
  barato (fica só em `creditoPixPendente`, sem nenhum item marcado), esse
  valor **ainda precisa aparecer** na tela de conferência como uma linha
  própria (não presa a nenhum débito específico). Esse foi o bug mais
  grave encontrado no front-end: se esquecer disso, um Pix pequeno fica
  "invisível" e nunca é confirmado. Confirmar essa linha soma o valor
  direto no `creditoAdiantado` (vira dinheiro confirmado).

### Arredondamento de dinheiro (importante e fácil de esquecer)

JavaScript (e ponto flutuante em geral) pode gerar somas do tipo
`172.32999999999996` em vez de `172.33`. **Arredonde para 2 casas decimais
todo valor que for gravado no banco** (total da notinha, créditos, valor de
cada pagamento) — não só na hora de exibir. No banco, isso é resolvido
naturalmente se as colunas de dinheiro forem `Decimal` (não `Float`) no
Postgres/Prisma — **use `Decimal` para todo campo de dinheiro**, nunca
`Float`/`Int` de centavos improvisado.

## 5. Outras regras que não podem se perder

- **Nada é apagado de verdade.** Cancelar um débito, estornar uma notinha,
  desativar um cliente/propriedade — tudo isso é uma mudança de status,
  nunca um `DELETE`. O histórico de auditoria depende disso.
- **Um débito nunca pode estar em duas notinhas ao mesmo tempo.** Ao criar
  uma notinha, valide que todo débito selecionado ainda está com status
  `aberto` e pertence ao cliente informado (outra pessoa pode ter cobrado
  ele em outra notinha entre o carregamento da tela e o clique em "gerar").
- **Notinha "Editar"**: além de estornar, o sistema permite reabrir uma
  notinha paga, adicionar mais débitos "em aberto" do mesmo cliente a uma
  notinha já existente, e remover um item dela (ele volta pra "em aberto").
  Editar a competência de uma notinha deve também atualizar o campo
  "competência da notinha" guardado em cada débito vinculado.
- **Competência** é sempre `MM/AAAA`, mês entre 01 e 12. Valide isso no
  back-end (não confie só na máscara do front) — competência inválida
  (ex.: "13/2026") precisa ser rejeitada.
- **Honorário fixo do Escritório**: cada cliente pode ter um valor fixo
  cadastrado (só admin vê/edita). Ao criar uma notinha, se o cliente tiver
  esse valor, por padrão um item "Escritório" com esse valor é incluído
  automaticamente na notinha (o admin pode desmarcar isso na hora de criar
  — funcionário não vê a opção, mas o valor entra do mesmo jeito por
  padrão).
- **Busca global** precisa cobrir: nome/CPF-CNPJ de cliente, descrição de
  débito, competência, valor, e número de notinha (com ou sem `#`) — tudo
  numa busca só.
- **Agrupar notinhas pra imprimir**: é só uma tela de **leitura** (junta
  duas ou mais notinhas do MESMO cliente num resumo pra imprimir) — não
  cria nem altera nada no banco.

## 6. Bugs reais que já apareceram no front-end (não repita no back)

Essa lista é o resultado de duas rodadas de auditoria bem a fundo no
front-end. Cada item já foi corrigido lá — é só pra você não recriar o
mesmo problema do zero na API:

1. Cancelar um débito que pertence a uma notinha **tem** que reduzir o
   `total` dela — senão a notinha fica "devendo" um valor cancelado pra
   sempre.
2. Estornar uma notinha **tem** que tirar os itens da lista dela (não só
   soltar o vínculo do lado do débito) — senão, se aquele débito for
   reaproveitado numa notinha nova depois, a notinha estornada antiga
   "vaza" esse estado novo e mistura o histórico de duas notinhas
   diferentes.
3. "Pagar tudo" tem que descontar qualquer crédito (`creditoAdiantado` /
   `creditoPixPendente`) que já existia antes de cobrar o valor "novo" —
   senão conta dinheiro em dobro.
4. Pagamento parcial **precisa** ter um teto (não pode ser maior que o
   saldo em aberto da notinha) — sobrepagamento cria um crédito que se
   perde.
5. Um Pix parcial pequeno demais pra fechar até o item mais barato
   **ainda precisa aparecer** na tela de conferência (crédito solto, sem
   item específico).
6. Todo valor de dinheiro gravado precisa estar redondo em centavos —
   nunca deixe uma soma "crua" (não arredondada) ser persistida.
7. Alterar o status de um débito pra "pago via Pix" (correção manual) tem
   que ir pra fila de conferência — não pode fechar direto, senão quebra a
   consistência com o resto do fluxo de Pix.

## 7. Onde tirar dúvida

Se alguma regra aqui parecer incompleta ou ambígua na hora de implementar,
a resposta certa está em `src/lib/db.js` (dentro do zip do front-end) — é
código comentado em português, função por função, e foi testado
manualmente contra vários cenários reais (inclusive os 7 bugs da seção 6,
com script de teste automatizado). Trate esse arquivo como a especificação
executável do sistema.

**Regra de ouro para qualquer IA lendo isso**: se uma mudança pedida for
mexer em alguma coisa desta lista (status, cálculo de dinheiro, permissão),
pare e pergunte antes de aplicar, em vez de assumir e seguir em frente.