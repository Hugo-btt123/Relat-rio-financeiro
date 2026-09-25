# Crediário Digital — Front-end

Front-end em **React + Vite + Bootstrap 5** para o sistema de crediário digital do
escritório contábil.

Este pacote é **somente front-end**. Toda a "camada de dados" hoje
roda no navegador (localStorage), mas foi desenhada para ser trocada pelo
back-end real (Node.js + Prisma + PostgreSQL) sem precisar mexer nas telas — veja o
`GUIA-VSCODE-E-PRISMA.md` para o passo a passo completo.

## Como rodar

```bash
npm install
npm run dev
```

Abra o endereço que o Vite mostrar no terminal (geralmente `http://localhost:5173`).

Login de demonstração:
- usuário: `admin` / senha: `admin123` (administrador)
- usuário: `funcionario` / senha: `123456` (funcionário)

(esses usuários estão cadastrados "na mão" em `src/lib/db.js`, função
`bancoPadrao()` — quando o back-end existir, o login vai bater direto na
API, que confere a senha contra a tabela `Usuario` do PostgreSQL via Prisma).

## Estrutura de pastas

```
src/
  lib/
    db.js          -> "banco de dados" falso (localStorage) — TROCAR AQUI quando o back-end existir
    format.js       -> formatação de moeda, datas, máscaras de competência/CPF/telefone
    recentes.js      -> atalho de UX (clientes acessados recentemente)
  context/
    AuthContext.jsx  -> quem está logado
    ToastContext.jsx -> avisos rápidos (toasts)
  components/
    layout/          -> Sidebar, Topbar, Layout
    common/          -> Modal, ConfirmModal, MenuAcoes (dropdown "..."), StatusBadge,
                         ClienteAutocomplete, PagamentoDinheiroModal
  pages/
    Login/
    Essencial/       -> o "caderno": lançamento rápido, lançamento em grupo, tabela geral
    Clientes/        -> lista, cadastro (com aviso de duplicado), ficha do cliente
    Notinhas/        -> lista, nova notinha, detalhe da notinha (pagar/estornar)
    ConferirPix/      -> confirmação de Pix pendente
    Dashboard/        -> métricas por competência
    BuscaGlobal/      -> busca única em clientes + débitos + notinhas
    Historico/        -> log de auditoria
```

## Regras de negócio implementadas (resumo)

- **Status do débito**: `em aberto` → `cobrado` → `pago` (ou `cancelado` a
  qualquer momento a partir de aberto/cobrado). Nada é apagado de verdade.
- **Em aberto**: editar, excluir (cancelar), adicionar à notinha, marcar pago
  em dinheiro (vai direto para "pago"), marcar pago via Pix (vai para
  "cobrado" com selo "Pix a conferir", sem notinha).
- **Cobrado**: ou está dentro de uma notinha (`notinhaId` preenchido, com a
  competência da notinha registrada), ou é um Pix avulso aguardando
  conferência.
- **Pago**: guarda forma de pagamento, data e observação (todos opcionais).
- **Notinha**: agrupa débitos "em aberto" de um único cliente. Ao gerar, todos
  os itens seleciondos viram "cobrado" e ganham o `notinhaId` — um débito não
  pode entrar em duas notinhas porque a criação valida que ele ainda está "em
  aberto" antes de vincular.
- **Pagamento de notinha**:
  - *Pagar tudo (dinheiro)* — marca todos os itens como pagos na hora.
  - *Pagar tudo (Pix)* — marca os itens como "Pix a conferir"; eles só viram
    "pago" (e a notinha só fecha) depois de confirmados na tela **Conferir
    Pix**.
  - *Pagar parcial* — **decisão de projeto** (não estava 100% especificado):
    o valor informado é abatido dos itens em ordem cronológica; um item só
    fica "pago" quando o valor recebido cobre ele inteiro. O que sobra sem
    fechar um item fica guardado como "crédito adiantado" da notinha, usado
    automaticamente no próximo pagamento parcial. Isso reproduz o exemplo que
    você mandou (notinha #019: pagamento de R$140 quitou exatamente o item de
    R$140 e deixou os outros dois como "cobrado"). Se você quiser uma regra
    diferente (por exemplo, permitir pagar "meio item"), me avise que ajusto
    só essa função em `db.js`.
  - *Estornar* — todos os itens não cancelados voltam para "em aberto"
    (perdem o vínculo com a notinha); a notinha fica marcada como "estornada"
    e nunca é apagada.
- **Histórico**: toda ação relevante gera uma linha de log (quem, quando, o
  quê) — usado tanto na aba global **Histórico** quanto na linha do tempo
  dentro da ficha do cliente e da notinha.
- **Dashboard**: métricas calculadas em cima da competência selecionada, mais
  um "Top 5" de clientes com maior valor em aberto (esse ranking olha para
  todos os débitos em aberto, não só os da competência, porque é uma visão de
  risco/inadimplência).

## Itens do backlog que ficaram de fora de propósito

Segundo o `Backlog.pdf`, os itens **BL-02** (restringir à rede interna) e
**BL-21** (suportar 15 usuários simultâneos) são responsabilidade do
back-end/infraestrutura, não do front-end — nada a fazer aqui.

## Como plugar o back-end depois

Toda a lógica de dados está isolada em **`src/lib/db.js`**. Cada função
exportada de lá (`listarClientes`, `criarDebito`, `pagarNotinhaTotalDinheiro`,
etc.) já é `async` e já devolve exatamente o formato que as telas esperam.
Quando o back-end (Node.js + Prisma + PostgreSQL) estiver pronto, o trabalho é
reescrever o **corpo** dessas funções trocando `localStorage`/arrays em
memória por chamadas reais (`fetch('/api/...')` numa API Express que usa o
Prisma por trás) — nenhuma tela em `src/pages` deve precisar mudar. Veja o
`GUIA-VSCODE-E-PRISMA.md` para o passo a passo completo, incluindo o schema
do Prisma e a lista de rotas esperadas.

## Paleta de cores

Branco, azul-marinho e dourado, como pedido — definidos como variáveis CSS em
`src/index.css` (`--cd-azul-*`, `--cd-dourado-*`). A tipografia usa uma fonte
serifada nos títulos (clima de "livro-caixa") e uma fonte sem serifa nos
números/tabelas, para ficar limpo e rápido de ler.