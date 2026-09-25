/* ==========================================================================
   CAMADA DE DADOS — "banco de dados" falso do front-end
   --------------------------------------------------------------------------
   IMPORTANTE PARA QUANDO O BACK-END (Node.js + Prisma + PostgreSQL) FOR
   CONSTRUÍDO:

   Este arquivo é a ÚNICA parte do sistema que sabe "onde os dados moram".
   Hoje ele guarda tudo no localStorage do navegador, só para o front-end
   funcionar de forma independente. Todas as funções são `async` e devolvem
   Promises de propósito — exatamente como uma chamada real à API (Express
   + Prisma) devolveria. Ou seja: quando o back-end estiver pronto, basta
   reescrever o CORPO de cada função aqui dentro (trocando localStorage por
   `fetch(...)` chamando a API) que NENHUMA tela vai precisar mudar, porque
   todas elas só conhecem os nomes das funções exportadas (ex.:
   `listarClientes`, `criarDebito`, `pagarNotinhaTotal` etc). Veja o
   GUIA-VSCODE-E-PRISMA.md para o passo a passo completo.

   Estrutura geral do "banco":
   - usuarios     -> login do sistema (administrador / funcionário)
   - clientes     -> cadastro de clientes do escritório
   - propriedades -> filiais/imóveis vinculados a um cliente (opcional)
   - debitos      -> cada linha do "caderno" (a aba Essencial)
   - notinhas     -> faturas que agrupam vários débitos de um cliente
   - historico    -> log de auditoria (quem fez o quê, e quando)
   ========================================================================== */

import { competenciaValida } from './format.js'

const CHAVE_ARMAZENAMENTO = 'crediario_digital_db_v1'

/* --------------------------------------------------------------------------
   Utilidades internas
   -------------------------------------------------------------------------- */

// Gera um id simples e único (suficiente para o protótipo em localStorage).
function novoId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

// Data/hora atual no formato ISO, usada em "criadoEm" / "atualizadoEm".
function agoraIso() {
  return new Date().toISOString()
}

// Arredonda qualquer valor em dinheiro para 2 casas decimais "de verdade".
// JavaScript representa números decimais em binário, então somas como
// 10.10 + 20.20 + 5.05 podem resultar em algo como 35.349999999999994 em
// vez de 35.35 — invisível na tela (a formatação de moeda já arredonda pra
// exibir), mas aparece feio em exportações (.json/.xlsx) e pode acumular
// erro ao longo de várias operações. Por isso TODO valor em dinheiro que
// entra ou é recalculado no sistema passa por aqui antes de ser guardado.
function arredondar(valor) {
  return Number((Number(valor) || 0).toFixed(2))
}

// Formata a competência atual do sistema no padrão MM/AAAA.
export function competenciaAtual() {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  return `${mes}/${d.getFullYear()}`
}

// Simula a latência de uma chamada de rede real (bem curta, para o app
// continuar parecendo instantâneo, como o cliente pediu).
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 40))
}

/* --------------------------------------------------------------------------
   Carregamento / gravação do "banco" no localStorage
   -------------------------------------------------------------------------- */

function bancoPadrao() {
  return {
    usuarios: [
      { id: 'u-admin', nome: 'Administrador', login: 'admin', senha: 'admin123', papel: 'administrador' },
      { id: 'u-func', nome: 'Funcionário Teste', login: 'funcionario', senha: '123456', papel: 'funcionario' },
    ],
    clientes: [],
    propriedades: [],
    debitos: [],
    notinhas: [],
    historico: [],
    contadorNotinha: 0,
    sessaoUsuarioId: null,
  }
}

function carregarBanco() {
  try {
    const bruto = localStorage.getItem(CHAVE_ARMAZENAMENTO)
    if (!bruto) {
      const inicial = bancoPadrao()
      semearDadosDemonstracao(inicial)
      salvarBanco(inicial)
      return inicial
    }
    return migrarBanco(JSON.parse(bruto))
  } catch (erro) {
    console.error('Falha ao carregar o banco local, recriando do zero.', erro)
    const inicial = bancoPadrao()
    salvarBanco(inicial)
    return inicial
  }
}

// Preenche com valores padrão qualquer campo que tenha sido adicionado ao
// sistema DEPOIS que alguns dados já existiam salvos no navegador (ex.:
// notinhas criadas antes do recurso de Pix parcial existir não têm
// `creditoPixPendente`; clientes criados antes do honorário fixo não têm
// `honorarioEscritorio`). Sem isso, um cliente/notinha "antigo" no
// localStorage quebraria (viraria `NaN` ou `undefined`) assim que passasse
// por uma conta que espera esses campos existirem. Roda toda vez que os
// dados são carregados — é seguro rodar de novo em cima de dados já
// migrados, porque só mexe no que estiver faltando.
function migrarBanco(banco) {
  if (!banco.clientes) banco.clientes = []
  if (!banco.propriedades) banco.propriedades = []
  if (!banco.debitos) banco.debitos = []
  if (!banco.notinhas) banco.notinhas = []
  if (!banco.historico) banco.historico = []
  if (!banco.usuarios) banco.usuarios = []

  banco.clientes.forEach((c) => {
    if (typeof c.honorarioEscritorio !== 'number' || Number.isNaN(c.honorarioEscritorio)) c.honorarioEscritorio = 0
    if (!c.status) c.status = 'ativo'
  })
  banco.propriedades.forEach((p) => {
    if (!p.status) p.status = 'ativo'
  })
  banco.debitos.forEach((d) => {
    if (typeof d.pixPendente !== 'boolean') d.pixPendente = false
    if (d.notinhaId === undefined) d.notinhaId = null
    if (d.competenciaNotinha === undefined) d.competenciaNotinha = null
    if (d.propriedadeId === undefined) d.propriedadeId = null
  })
  banco.notinhas.forEach((n) => {
    if (typeof n.creditoAdiantado !== 'number' || Number.isNaN(n.creditoAdiantado)) n.creditoAdiantado = 0
    if (typeof n.creditoPixPendente !== 'number' || Number.isNaN(n.creditoPixPendente)) n.creditoPixPendente = 0
    if (!Array.isArray(n.pagamentos)) n.pagamentos = []
    if (!Array.isArray(n.itensIds)) n.itensIds = []
  })
  if (typeof banco.contadorNotinha !== 'number') {
    banco.contadorNotinha = banco.notinhas.reduce((max, n) => Math.max(max, n.numeroSequencial || 0), 0)
  }
  if (banco.sessaoUsuarioId === undefined) banco.sessaoUsuarioId = null

  return banco
}

function salvarBanco(banco) {
  try {
    localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify(banco))
  } catch (erro) {
    // Isso normalmente só acontece se o armazenamento do navegador
    // (limitado a poucos MB) encher depois de muito tempo de uso — o que
    // não vai mais acontecer assim que os dados morarem num banco de
    // verdade (Prisma/PostgreSQL). Até lá, avisamos com uma mensagem que
    // faça sentido pro contador, em vez do erro técnico do navegador —
    // e, mais importante, AVISAMOS que a última ação pode não ter sido
    // salva de verdade (o estado em memória já tinha mudado, mas gravar
    // falhou), pra ninguém confiar numa mudança que sumiria ao recarregar.
    console.error('Falha ao salvar no localStorage:', erro)
    throw new Error('Não foi possível salvar — o armazenamento do navegador está cheio. Faça um backup (aba Backup) o quanto antes e avise o suporte técnico; a última ação pode não ter sido salva.')
  }
}

// Estado em memória (carregado uma vez, sincronizado a cada mutação).
let banco = carregarBanco()

function persistir() {
  salvarBanco(banco)
}

/* --------------------------------------------------------------------------
   Dados de demonstração — apenas para o sistema não nascer "vazio".
   Pode ser apagado tranquilamente pela tela (ou limpando o localStorage).
   -------------------------------------------------------------------------- */
function semearDadosDemonstracao(b) {
  const clienteExemplo = {
    id: novoId(),
    nome: 'Padaria Bela Vista LTDA',
    cpf: '',
    telefone: '(35) 99999-1234',
    observacoes: 'Cliente desde 2022. Prefere ser cobrado por Pix.',
    status: 'ativo',
    criadoEm: agoraIso(),
  }
  const clienteExemplo2 = {
    id: novoId(),
    nome: 'Maria Aparecida Souza',
    cpf: '123.456.789-00',
    telefone: '(35) 98888-4321',
    observacoes: '',
    status: 'ativo',
    criadoEm: agoraIso(),
  }
  b.clientes.push(clienteExemplo, clienteExemplo2)

  const comp = competenciaAtual()
  b.debitos.push(
    {
      id: novoId(), clienteId: clienteExemplo.id, propriedadeId: null,
      descricao: 'FGTS', valor: 210, competencia: comp, observacao: '',
      status: 'aberto', notinhaId: null, competenciaNotinha: null, pixPendente: false,
      formaPagamento: null, dataPagamento: null, obsPagamento: null,
      criadoEm: agoraIso(), criadoPor: 'Administrador', atualizadoEm: agoraIso(),
    },
    {
      id: novoId(), clienteId: clienteExemplo.id, propriedadeId: null,
      descricao: 'INSS', valor: 340, competencia: comp, observacao: '',
      status: 'aberto', notinhaId: null, competenciaNotinha: null, pixPendente: false,
      formaPagamento: null, dataPagamento: null, obsPagamento: null,
      criadoEm: agoraIso(), criadoPor: 'Administrador', atualizadoEm: agoraIso(),
    },
    {
      id: novoId(), clienteId: clienteExemplo2.id, propriedadeId: null,
      descricao: 'IRPF', valor: 480, competencia: comp, observacao: 'declaração anual',
      status: 'aberto', notinhaId: null, competenciaNotinha: null, pixPendente: false,
      formaPagamento: null, dataPagamento: null, obsPagamento: null,
      criadoEm: agoraIso(), criadoPor: 'Administrador', atualizadoEm: agoraIso(),
    },
  )
}

/* --------------------------------------------------------------------------
   Histórico / auditoria
   -------------------------------------------------------------------------- */

// Registra uma linha no log de auditoria. É chamada internamente por quase
// todas as outras funções deste arquivo — nunca precisa ser chamada pelas
// telas diretamente.
function registrarHistorico({ entidade, entidadeId, entidadeLabel, acao, detalhes, clienteId = null }) {
  const usuario = usuarioAtualSincrono()
  banco.historico.unshift({
    id: novoId(),
    quando: agoraIso(),
    entidade, // 'Débito' | 'Cliente' | 'Notinha' | 'Usuário' | 'Pix'
    entidadeId,
    entidadeLabel, // texto amigável para exibir na lista (ex.: nome do cliente)
    acao, // 'Criado' | 'Editado' | 'Cancelado' | 'Cobrado' | 'Pago' | 'Pix conferido' | 'Estornado' ...
    operador: usuario ? usuario.nome : 'Sistema',
    detalhes: detalhes || '',
    clienteId, // usado para montar a linha do tempo dentro da ficha do cliente
  })
  // mantém só os últimos 300 eventos, como pedido no protótipo original
  banco.historico = banco.historico.slice(0, 300)
}

export async function listarHistorico({ entidade = 'todas', operador = '' } = {}) {
  await tick()
  return banco.historico.filter((h) => {
    if (entidade !== 'todas' && h.entidade !== entidade) return false
    if (operador && !h.operador.toLowerCase().includes(operador.toLowerCase())) return false
    return true
  })
}

// Linha do tempo de um cliente específico (usada na ficha do cliente, no
// estilo "WhatsApp": tudo que aconteceu com ele, em ordem cronológica).
// Linha do tempo de uma notinha específica (gerada, pagamentos, quitação,
// estorno) — mostrada na própria tela de detalhe da notinha.
export async function listarHistoricoDaNotinha(notinhaId) {
  await tick()
  return banco.historico
    .filter((h) => h.entidade === 'Notinha' && h.entidadeId === notinhaId)
    .sort((a, b) => new Date(a.quando) - new Date(b.quando))
}

export async function listarHistoricoDoCliente(clienteId) {
  await tick()
  return banco.historico
    .filter((h) => h.clienteId === clienteId)
    .sort((a, b) => new Date(a.quando) - new Date(b.quando))
}

/* --------------------------------------------------------------------------
   Autenticação (bem simples — login e senha guardados no próprio banco)
   -------------------------------------------------------------------------- */

function usuarioAtualSincrono() {
  return banco.usuarios.find((u) => u.id === banco.sessaoUsuarioId) || null
}

export async function entrar(login, senha) {
  await tick()
  const usuario = banco.usuarios.find(
    (u) => u.login.toLowerCase() === String(login).trim().toLowerCase() && u.senha === senha
  )
  if (!usuario) {
    throw new Error('Login ou senha inválidos.')
  }
  banco.sessaoUsuarioId = usuario.id
  persistir()
  registrarHistorico({
    entidade: 'Usuário', entidadeId: usuario.id, entidadeLabel: usuario.nome,
    acao: 'Login', detalhes: '',
  })
  return { ...usuario }
}

export async function sair() {
  await tick()
  banco.sessaoUsuarioId = null
  persistir()
}

export async function usuarioAtual() {
  await tick()
  const u = usuarioAtualSincrono()
  return u ? { ...u } : null
}

/* --------------------------------------------------------------------------
   Clientes
   -------------------------------------------------------------------------- */

function paraClientePublico(c) {
  return { ...c }
}

export async function listarClientes({ busca = '', status = 'todos' } = {}) {
  await tick()
  const buscaNorm = busca.trim().toLowerCase()
  return banco.clientes
    .filter((c) => {
      if (status !== 'todos' && c.status !== status) return false
      if (!buscaNorm) return true
      return (
        c.nome.toLowerCase().includes(buscaNorm) ||
        (c.cpf || '').toLowerCase().includes(buscaNorm)
      )
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map(paraClientePublico)
}

// Usada pelo autocomplete: procura clientes com nome parecido, para evitar
// cadastro duplicado e para ajudar a digitar mais rápido.
export async function buscarClientesPorNome(texto, limite = 8) {
  await tick()
  const t = texto.trim().toLowerCase()
  if (!t) return []
  return banco.clientes
    .filter((c) => c.nome.toLowerCase().includes(t))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, limite)
    .map(paraClientePublico)
}

export async function buscarClientePorId(id) {
  await tick()
  const c = banco.clientes.find((c) => c.id === id)
  return c ? paraClientePublico(c) : null
}

export async function criarCliente({ nome, cpf = '', telefone = '', observacoes = '', honorarioEscritorio = 0 }) {
  await tick()
  if (!nome || !nome.trim()) {
    throw new Error('O nome do cliente é obrigatório.')
  }
  const cliente = {
    id: novoId(),
    nome: nome.trim(),
    cpf: cpf.trim(),
    telefone: telefone.trim(),
    observacoes: observacoes.trim(),
    status: 'ativo',
    // Valor fixo de honorário que, por padrão, entra em toda notinha nova
    // desse cliente (visível/editável só pelo administrador nas telas).
    honorarioEscritorio: arredondar(honorarioEscritorio),
    criadoEm: agoraIso(),
  }
  banco.clientes.push(cliente)
  registrarHistorico({
    entidade: 'Cliente', entidadeId: cliente.id, entidadeLabel: cliente.nome,
    acao: 'Criado', detalhes: '', clienteId: cliente.id,
  })
  persistir()
  return paraClientePublico(cliente)
}

export async function atualizarCliente(id, dados) {
  await tick()
  const cliente = banco.clientes.find((c) => c.id === id)
  if (!cliente) throw new Error('Cliente não encontrado.')
  Object.assign(cliente, {
    nome: dados.nome?.trim() ?? cliente.nome,
    cpf: dados.cpf?.trim() ?? cliente.cpf,
    telefone: dados.telefone?.trim() ?? cliente.telefone,
    observacoes: dados.observacoes?.trim() ?? cliente.observacoes,
    status: dados.status ?? cliente.status,
    honorarioEscritorio: dados.honorarioEscritorio !== undefined ? arredondar(dados.honorarioEscritorio) : cliente.honorarioEscritorio,
  })
  registrarHistorico({
    entidade: 'Cliente', entidadeId: cliente.id, entidadeLabel: cliente.nome,
    acao: 'Editado', detalhes: '', clienteId: cliente.id,
  })
  persistir()
  return paraClientePublico(cliente)
}

/* --- Propriedades / filiais do cliente (opcional, usado no lançamento) --- */

// Por padrão devolve só as propriedades ATIVAS (para preencher os seletores
// de lançamento). Passe `{ apenasAtivas: false }` para ver todas, incluindo
// inativas — usado na ficha do cliente, onde o contador precisa gerenciá-las.
export async function listarPropriedades(clienteId, { apenasAtivas = true } = {}) {
  await tick()
  return banco.propriedades.filter((p) => p.clienteId === clienteId && (!apenasAtivas || p.status !== 'inativo'))
}

export async function criarPropriedade(clienteId, { nome, documento = '' }) {
  await tick()
  if (!nome || !nome.trim()) throw new Error('Informe um nome para a propriedade/filial.')
  const propriedade = { id: novoId(), clienteId, nome: nome.trim(), documento: documento.trim(), status: 'ativo', criadoEm: agoraIso() }
  banco.propriedades.push(propriedade)
  registrarHistorico({
    entidade: 'Propriedade', entidadeId: propriedade.id, entidadeLabel: `${clienteLabel(clienteId)} — ${propriedade.nome}`,
    acao: 'Criada', detalhes: '', clienteId,
  })
  persistir()
  return propriedade
}

// Edita nome, CNPJ/documento e status (ativo/inativo) de uma propriedade já
// cadastrada. Propriedades nunca são apagadas — só marcadas como inativas,
// e nesse caso somem dos seletores de novos lançamentos (mas continuam
// aparecendo nos débitos antigos que já as usavam, para conferência).
export async function atualizarPropriedade(id, { nome, documento, status }) {
  await tick()
  const propriedade = banco.propriedades.find((p) => p.id === id)
  if (!propriedade) throw new Error('Propriedade não encontrada.')
  if (nome !== undefined && !nome.trim()) throw new Error('O nome da propriedade não pode ficar vazio.')
  propriedade.nome = nome !== undefined ? nome.trim() : propriedade.nome
  propriedade.documento = documento !== undefined ? documento.trim() : propriedade.documento
  propriedade.status = status !== undefined ? status : propriedade.status
  registrarHistorico({
    entidade: 'Propriedade', entidadeId: propriedade.id, entidadeLabel: `${clienteLabel(propriedade.clienteId)} — ${propriedade.nome}`,
    acao: 'Editada', detalhes: '', clienteId: propriedade.clienteId,
  })
  persistir()
  return propriedade
}

/* --------------------------------------------------------------------------
   Débitos (o "caderno" — aba Essencial)
   -------------------------------------------------------------------------- */

function clienteLabel(clienteId) {
  const c = banco.clientes.find((c) => c.id === clienteId)
  return c ? c.nome : 'Cliente removido'
}

// Nome da propriedade/filial — usada só para conferência visual (não afeta
// nenhum cálculo), como pedido: quando um débito tem propriedade, ela
// aparece junto dele nas telas.
function propriedadeLabel(propriedadeId) {
  if (!propriedadeId) return null
  const p = banco.propriedades.find((p) => p.id === propriedadeId)
  return p ? p.nome : null
}

function paraDebitoPublico(d) {
  return { ...d, clienteNome: clienteLabel(d.clienteId), propriedadeNome: propriedadeLabel(d.propriedadeId) }
}

export async function listarDebitos({
  clienteId = null,
  status = 'todos', // 'todos' | 'aberto' | 'cobrado' | 'pago' | 'cancelado'
  competencia = '',
  busca = '',
  apenasPixPendente = false,
} = {}) {
  await tick()
  const buscaNorm = busca.trim().toLowerCase()
  return banco.debitos
    .filter((d) => {
      if (clienteId && d.clienteId !== clienteId) return false
      if (status !== 'todos' && d.status !== status) return false
      if (competencia && d.competencia !== competencia) return false
      if (apenasPixPendente && !d.pixPendente) return false
      if (buscaNorm && !d.descricao.toLowerCase().includes(buscaNorm)) return false
      return true
    })
    .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))
    .map(paraDebitoPublico)
}

export async function buscarDebitoPorId(id) {
  await tick()
  const d = banco.debitos.find((d) => d.id === id)
  return d ? paraDebitoPublico(d) : null
}

export async function criarDebito({ clienteId, propriedadeId = null, descricao, valor, competencia, observacao = '' }) {
  await tick()
  validarDadosDebito({ clienteId, descricao, valor, competencia })
  const usuario = usuarioAtualSincrono()
  const debito = {
    id: novoId(),
    clienteId,
    propriedadeId: propriedadeId || null,
    descricao: descricao.trim(),
    valor: arredondar(valor),
    competencia: competencia.trim(),
    observacao: observacao.trim(),
    status: 'aberto',
    notinhaId: null,
    competenciaNotinha: null,
    pixPendente: false,
    formaPagamento: null,
    dataPagamento: null,
    obsPagamento: null,
    criadoEm: agoraIso(),
    criadoPor: usuario ? usuario.nome : 'Sistema',
    atualizadoEm: agoraIso(),
  }
  banco.debitos.push(debito)
  registrarHistorico({
    entidade: 'Débito', entidadeId: debito.id, entidadeLabel: `${clienteLabel(clienteId)} — ${debito.descricao}`,
    acao: 'Criado', detalhes: `Valor R$ ${debito.valor.toFixed(2)} · competência ${debito.competencia}`, clienteId,
  })
  persistir()
  return paraDebitoPublico(debito)
}

// Lançamento em grupo: uma única descrição + competência, para vários
// clientes (cada um com seu próprio valor/propriedade/observação).
export async function criarDebitosEmGrupo({ descricao, competencia, linhas }) {
  await tick()
  if (!descricao || !descricao.trim()) throw new Error('Informe a descrição do débito.')
  if (!competencia || !competencia.trim()) throw new Error('Informe a competência.')
  if (!competenciaValida(competencia.trim())) throw new Error('Competência inválida — use o formato MM/AAAA (ex.: 04/2026).')
  const validas = linhas.filter((l) => l.clienteId && Number(l.valor) > 0)
  if (validas.length === 0) throw new Error('Adicione ao menos um cliente com valor maior que zero.')

  const usuario = usuarioAtualSincrono()
  const criados = validas.map((linha) => {
    const debito = {
      id: novoId(),
      clienteId: linha.clienteId,
      propriedadeId: linha.propriedadeId || null,
      descricao: descricao.trim(),
      valor: arredondar(linha.valor),
      competencia: competencia.trim(),
      observacao: (linha.observacao || '').trim(),
      status: 'aberto',
      notinhaId: null,
      competenciaNotinha: null,
      pixPendente: false,
      formaPagamento: null,
      dataPagamento: null,
      obsPagamento: null,
      criadoEm: agoraIso(),
      criadoPor: usuario ? usuario.nome : 'Sistema',
      atualizadoEm: agoraIso(),
    }
    banco.debitos.push(debito)
    registrarHistorico({
      entidade: 'Débito', entidadeId: debito.id, entidadeLabel: `${clienteLabel(debito.clienteId)} — ${debito.descricao}`,
      acao: 'Criado (lançamento em grupo)', detalhes: `Valor R$ ${debito.valor.toFixed(2)} · competência ${debito.competencia}`, clienteId: debito.clienteId,
    })
    return debito
  })
  persistir()
  return criados.map(paraDebitoPublico)
}

function validarDadosDebito({ clienteId, descricao, valor, competencia }) {
  if (!clienteId) throw new Error('Selecione um cliente.')
  if (!descricao || !descricao.trim()) throw new Error('Informe a descrição do débito.')
  if (!valor || Number(valor) <= 0) throw new Error('Informe um valor maior que zero.')
  if (!competencia || !competencia.trim()) throw new Error('Informe a competência.')
  if (!competenciaValida(competencia.trim())) throw new Error('Competência inválida — use o formato MM/AAAA (ex.: 04/2026).')
}

function localizarDebitoEditavel(id, statusPermitidos) {
  const debito = banco.debitos.find((d) => d.id === id)
  if (!debito) throw new Error('Débito não encontrado.')
  if (!statusPermitidos.includes(debito.status)) {
    throw new Error(`Esta ação não é permitida para um débito "${debito.status}".`)
  }
  return debito
}

// Só é permitido editar campos de um débito enquanto ele está "em aberto" —
// depois de cobrado/pago, a edição livre quebraria a rastreabilidade.
export async function editarDebito(id, { descricao, valor, competencia, observacao, propriedadeId }) {
  await tick()
  const debito = localizarDebitoEditavel(id, ['aberto'])
  if (competencia !== undefined && competencia.trim() && !competenciaValida(competencia.trim())) {
    throw new Error('Competência inválida — use o formato MM/AAAA (ex.: 04/2026).')
  }
  if (valor !== undefined && Number(valor) <= 0) throw new Error('Informe um valor maior que zero.')
  const antes = `${debito.descricao} · R$ ${debito.valor.toFixed(2)} · ${debito.competencia}`
  debito.descricao = descricao?.trim() ?? debito.descricao
  debito.valor = valor !== undefined ? arredondar(valor) : debito.valor
  debito.competencia = competencia?.trim() ?? debito.competencia
  debito.observacao = observacao !== undefined ? observacao.trim() : debito.observacao
  debito.propriedadeId = propriedadeId !== undefined ? propriedadeId : debito.propriedadeId
  debito.atualizadoEm = agoraIso()
  registrarHistorico({
    entidade: 'Débito', entidadeId: debito.id, entidadeLabel: `${clienteLabel(debito.clienteId)} — ${debito.descricao}`,
    acao: 'Editado', detalhes: `Antes: ${antes}`, clienteId: debito.clienteId,
  })
  persistir()
  return paraDebitoPublico(debito)
}

// Corrige manualmente o status de um débito que já foi cobrado/pago — usado
// para desfazer erros (ex.: marcou como pago sem querer, precisa voltar
// para "em aberto" ou "cobrado"). Diferente de `editarDebito`, essa função
// aceita débitos em qualquer status (menos cancelado) e sabe lidar com o
// vínculo à notinha:
//
//   alvo = 'aberto'  -> desliga totalmente da notinha (se houver) e some do
//                       total dela; o débito volta a valer como um
//                       lançamento novo, sem cobrança.
//   alvo = 'cobrado' -> desfaz o pagamento mas mantém o vínculo com a
//                       notinha (se houver); se não houver notinha, fica
//                       como "Pix a conferir" avulso de novo.
//   alvo = 'pago', opcoes.pix = false -> marca como pago em dinheiro na
//                       hora, sem passar pela fila de conferência.
//   alvo = 'pago', opcoes.pix = true  -> NÃO marca como pago direto — vai
//                       para "Pix a conferir" (mesmo fluxo de qualquer
//                       outro pagamento via Pix), só virando "pago" de
//                       verdade quando confirmado na tela Conferir Pix.
//
// Sempre que o débito pertence a uma notinha, essa alteração também é
// registrada no histórico DA NOTINHA (não só do débito), e se a notinha
// estava "paga" e deixou de estar totalmente quitada, ela volta sozinha
// para "ativa".
export async function alterarStatusDebito(id, alvo, opcoes = {}) {
  await tick()
  const debito = banco.debitos.find((d) => d.id === id)
  if (!debito) throw new Error('Débito não encontrado.')
  if (debito.status === 'cancelado') throw new Error('Um débito cancelado não pode ter o status alterado.')
  if (!['aberto', 'cobrado', 'pago'].includes(alvo)) throw new Error('Status de destino inválido.')

  const notinha = debito.notinhaId ? banco.notinhas.find((n) => n.id === debito.notinhaId) : null
  const rotuloAnterior = debito.status === 'cobrado' && debito.pixPendente ? 'Pix a conferir' : RÓTULOS_STATUS_INTERNO[debito.status]
  const notinhaEstavaPaga = notinha?.status === 'paga'
  // Só é considerado "pago de verdade, na hora" quando é dinheiro. Pago via
  // Pix sempre passa pela fila de conferência, igual a qualquer outro
  // pagamento via Pix do sistema.
  const ficaPagoAgora = alvo === 'pago' && !opcoes.pix

  if (alvo === 'aberto') {
    if (notinha) {
      notinha.itensIds = notinha.itensIds.filter((itemId) => itemId !== debito.id)
      notinha.total = arredondar(notinha.total - debito.valor)
    }
    debito.status = 'aberto'
    debito.notinhaId = null
    debito.competenciaNotinha = null
    debito.pixPendente = false
    debito.formaPagamento = null
    debito.dataPagamento = null
    debito.obsPagamento = opcoes.obs || null
  } else if (alvo === 'cobrado') {
    debito.status = 'cobrado'
    debito.pixPendente = !notinha && !!opcoes.pix // sem notinha, "cobrado" só existe como Pix a conferir
    debito.formaPagamento = null
    debito.dataPagamento = null
    if (opcoes.obs) debito.obsPagamento = opcoes.obs
  } else if (ficaPagoAgora) {
    debito.status = 'pago'
    debito.pixPendente = false
    debito.formaPagamento = 'Dinheiro'
    debito.dataPagamento = opcoes.dataPagamento || new Date().toISOString().slice(0, 10)
    if (opcoes.obs) debito.obsPagamento = opcoes.obs
  } else {
    // alvo === 'pago' com Pix: vai para conferência, não fecha ainda.
    debito.status = 'cobrado'
    debito.pixPendente = true
    debito.formaPagamento = null
    debito.dataPagamento = null
    if (opcoes.obs) debito.obsPagamento = opcoes.obs
  }
  debito.atualizadoEm = agoraIso()

  const rotuloNovo = (alvo === 'cobrado' && debito.pixPendente) || (alvo === 'pago' && !ficaPagoAgora)
    ? 'Pix a conferir'
    : RÓTULOS_STATUS_INTERNO[ficaPagoAgora ? 'pago' : alvo === 'pago' ? 'cobrado' : alvo]
  registrarHistorico({
    entidade: 'Débito', entidadeId: debito.id, entidadeLabel: `${clienteLabel(debito.clienteId)} — ${debito.descricao}`,
    acao: 'Status corrigido manualmente', detalhes: `De "${rotuloAnterior}" para "${rotuloNovo}"${opcoes.obs ? ` · ${opcoes.obs}` : ''}`,
    clienteId: debito.clienteId,
  })

  if (notinha) {
    registrarHistorico({
      entidade: 'Notinha', entidadeId: notinha.id, entidadeLabel: `${clienteLabel(notinha.clienteId)} — notinha #${notinha.numeroSequencial}`,
      acao: 'Item alterado',
      detalhes: `"${debito.descricao}" (R$ ${debito.valor.toFixed(2)}) alterado de "${rotuloAnterior}" para "${rotuloNovo}"${alvo === 'aberto' ? ' — removido da notinha' : ''}`,
      clienteId: notinha.clienteId,
    })
    if (notinhaEstavaPaga && !ficaPagoAgora) {
      notinha.status = 'ativa'
      registrarHistorico({
        entidade: 'Notinha', entidadeId: notinha.id, entidadeLabel: `${clienteLabel(notinha.clienteId)} — notinha #${notinha.numeroSequencial}`,
        acao: 'Reaberta automaticamente', detalhes: 'Um item deixou de estar pago.', clienteId: notinha.clienteId,
      })
    }
    if (ficaPagoAgora) {
      atualizarStatusNotinhaSeCompleta(notinha.id)
    }
  }

  persistir()
  return paraDebitoPublico(debito)
}

const RÓTULOS_STATUS_INTERNO = { aberto: 'Em aberto', cobrado: 'Cobrado', pago: 'Pago' }


// Nunca apagamos um débito de verdade — só marcamos como "cancelado". Se
// ele já estava dentro de uma notinha, o valor dele é subtraído do total
// da notinha (senão ela ficaria "devendo" um valor que não existe mais) e
// isso também fica registrado no histórico DA NOTINHA — e, se essa
// cancelada era a última pendência, a notinha fecha sozinha.
export async function cancelarDebito(id, motivo = '') {
  await tick()
  const debito = localizarDebitoEditavel(id, ['aberto', 'cobrado'])
  const notinha = debito.notinhaId ? banco.notinhas.find((n) => n.id === debito.notinhaId) : null

  debito.status = 'cancelado'
  debito.atualizadoEm = agoraIso()
  registrarHistorico({
    entidade: 'Débito', entidadeId: debito.id, entidadeLabel: `${clienteLabel(debito.clienteId)} — ${debito.descricao}`,
    acao: 'Cancelado', detalhes: motivo, clienteId: debito.clienteId,
  })

  if (notinha) {
    notinha.total = arredondar(notinha.total - debito.valor)
    registrarHistorico({
      entidade: 'Notinha', entidadeId: notinha.id, entidadeLabel: `${clienteLabel(notinha.clienteId)} — notinha #${notinha.numeroSequencial}`,
      acao: 'Item cancelado', detalhes: `"${debito.descricao}" (R$ ${debito.valor.toFixed(2)}) cancelado — total da notinha ajustado.`,
      clienteId: notinha.clienteId,
    })
    atualizarStatusNotinhaSeCompleta(notinha.id) // se era a última pendência, a notinha fecha sozinha
  }

  persistir()
  return paraDebitoPublico(debito)
}

// "Marcar pago em dinheiro" a partir de "em aberto": o débito vai direto
// para a aba de pagos, sem passar por notinha.
export async function marcarPagoDinheiro(id, { formaPagamento = 'Dinheiro', dataPagamento = '', obs = '' } = {}) {
  await tick()
  const debito = localizarDebitoEditavel(id, ['aberto'])
  debito.status = 'pago'
  debito.pixPendente = false
  debito.formaPagamento = formaPagamento
  debito.dataPagamento = dataPagamento || new Date().toISOString().slice(0, 10)
  debito.obsPagamento = obs
  debito.atualizadoEm = agoraIso()
  registrarHistorico({
    entidade: 'Débito', entidadeId: debito.id, entidadeLabel: `${clienteLabel(debito.clienteId)} — ${debito.descricao}`,
    acao: 'Pago', detalhes: `Forma: ${formaPagamento}`, clienteId: debito.clienteId,
  })
  persistir()
  return paraDebitoPublico(debito)
}

// "Marcar pago via Pix" a partir de "em aberto": o débito passa a
// "cobrado" com a marca de Pix pendente de conferência (ele vai aparecer
// na tela "Conferir Pix" até o contador confirmar o extrato).
// `obs` é opcional — qualquer observação sobre esse Pix (ex.: "cliente
// mandou comprovante por WhatsApp") fica registrada junto do débito.
export async function marcarPagoPix(id, obs = '') {
  await tick()
  const debito = localizarDebitoEditavel(id, ['aberto'])
  debito.status = 'cobrado'
  debito.pixPendente = true
  debito.obsPagamento = obs
  debito.atualizadoEm = agoraIso()
  registrarHistorico({
    entidade: 'Débito', entidadeId: debito.id, entidadeLabel: `${clienteLabel(debito.clienteId)} — ${debito.descricao}`,
    acao: 'Pix aguardando conferência', detalhes: obs, clienteId: debito.clienteId,
  })
  persistir()
  return paraDebitoPublico(debito)
}

// Confirma que o Pix realmente caiu na conta (usado na tela "Conferir Pix").
// Funciona tanto para débitos avulsos (sem notinha) quanto para itens de
// notinha que foram pagos via Pix.
export async function confirmarPix(id) {
  await tick()
  await confirmarPixInterno(id)
  persistir()
  return paraDebitoPublico(banco.debitos.find((d) => d.id === id))
}

// Confirma vários débitos de uma vez (usado quando o contador confirma uma
// notinha inteira que foi paga via Pix, agrupada numa linha só na tela de
// conferência).
export async function confirmarPixEmLote(ids) {
  await tick()
  ids.forEach((id) => confirmarPixInterno(id))
  persistir()
}

// Versão interna, sem "tick"/"persistir" — assim dá pra confirmar vários
// débitos em sequência (lote) sem gravar no localStorage a cada um.
function confirmarPixInterno(id) {
  const debito = banco.debitos.find((d) => d.id === id)
  if (!debito) throw new Error('Débito não encontrado.')
  if (!debito.pixPendente) throw new Error('Este débito não está aguardando conferência de Pix.')

  debito.status = 'pago'
  debito.pixPendente = false
  debito.formaPagamento = 'Pix'
  debito.dataPagamento = new Date().toISOString().slice(0, 10)
  debito.atualizadoEm = agoraIso()
  registrarHistorico({
    entidade: 'Débito', entidadeId: debito.id, entidadeLabel: `${clienteLabel(debito.clienteId)} — ${debito.descricao}`,
    acao: 'Pix conferido', detalhes: '', clienteId: debito.clienteId,
  })

  // Se esse débito pertence a uma notinha, verificamos o estado dela: se
  // não sobrou nenhum item aguardando Pix, qualquer "crédito Pix" ainda não
  // confirmado dessa notinha passa a valer como confirmado — e, se todos os
  // itens já estiverem pagos, a notinha inteira passa a "paga".
  if (debito.notinhaId) {
    const notinha = banco.notinhas.find((n) => n.id === debito.notinhaId)
    if (notinha) {
      const aindaTemPixPendente = banco.debitos.some((d) => d.notinhaId === notinha.id && d.pixPendente)
      if (!aindaTemPixPendente && notinha.creditoPixPendente > 0) {
        notinha.creditoAdiantado = arredondar(notinha.creditoAdiantado + notinha.creditoPixPendente)
        notinha.creditoPixPendente = 0
      }
    }
    atualizarStatusNotinhaSeCompleta(debito.notinhaId)
  }
}

// Confirma um "crédito Pix" de uma notinha que ainda não fechou nenhum item
// inteiro (ex.: pagou parcial R$ 500 de uma notinha de R$ 1.500 via Pix, e
// nenhum item isolado custa R$ 500 ou menos) — esse valor não aparece preso
// a nenhum débito específico, por isso tem essa confirmação separada.
export async function confirmarCreditoPixNotinha(notinhaId) {
  await tick()
  const notinha = banco.notinhas.find((n) => n.id === notinhaId)
  if (!notinha) throw new Error('Notinha não encontrada.')
  if (!notinha.creditoPixPendente) throw new Error('Não há crédito Pix pendente de conferência nesta notinha.')

  const valor = notinha.creditoPixPendente
  notinha.creditoAdiantado = arredondar(notinha.creditoAdiantado + valor)
  notinha.creditoPixPendente = 0
  registrarHistorico({
    entidade: 'Notinha', entidadeId: notinha.id, entidadeLabel: `${clienteLabel(notinha.clienteId)} — notinha #${notinha.numeroSequencial}`,
    acao: 'Pix conferido (parcial)', detalhes: `Crédito de R$ ${valor.toFixed(2)} confirmado`, clienteId: notinha.clienteId,
  })
  atualizarStatusNotinhaSeCompleta(notinha.id)
  persistir()
  return paraNotinhaPublica(notinha)
}

// Monta a lista da tela "Conferir Pix". Em vez de simplesmente listar cada
// débito pendente separado, ela agrupa quando faz sentido:
//
//  - Débito avulso (sem notinha) -> uma linha normal.
//  - TODOS os itens de uma notinha estão com Pix pendente (a notinha
//    inteira foi paga via Pix) -> vira UMA linha só, representando a
//    notinha inteira, com um botão que confirma tudo de uma vez.
//  - SÓ PARTE dos itens de uma notinha está com Pix pendente (pagamento
//    parcial) -> cada item aparece separado, mas com a anotação "X de Y"
//    mostrando quanto daquela notinha esse Pix representa.
//  - Sobrou "crédito Pix" que não fechou nenhum item inteiro (ex.: pagou
//    R$ 500 via Pix de uma notinha de R$ 1.500, mas nenhum item isolado
//    custa R$ 500 ou menos) -> aparece como uma linha própria, presa à
//    notinha mas sem nenhum débito específico.
// Monta a lista da tela "Conferir Pix". Em vez de simplesmente listar cada
// débito pendente separado, ela agrupa quando faz sentido:
//
//  - Débito avulso (sem notinha) -> uma linha normal.
//  - TODOS os itens de uma notinha estão com Pix pendente (a notinha
//    inteira foi paga via Pix) -> vira UMA linha só, representando a
//    notinha inteira, com um botão que confirma tudo de uma vez.
//  - SÓ PARTE dos itens de uma notinha está com Pix pendente (pagamento
//    parcial) -> cada item aparece separado, mas com a anotação "X de Y"
//    mostrando quanto daquela notinha esse Pix representa.
//  - Sobrou "crédito Pix" que não fechou nenhum item inteiro (ex.: pagou
//    R$ 500 via Pix de uma notinha de R$ 1.500, mas nenhum item isolado
//    custa R$ 500 ou menos) -> aparece como uma linha própria, presa à
//    notinha mas sem nenhum débito específico. Isso é tratado num laço
//    SEPARADO dos itens pixPendente de propósito: esse crédito pode
//    existir mesmo quando NENHUM item da notinha chegou a ficar marcado
//    como pixPendente (o valor pago não fechou nem o item mais barato) —
//    se ficasse dentro do laço "por item pendente", esse caso nunca
//    apareceria pro contador confirmar.
export async function listarPixPendentes() {
  await tick()
  const pendentes = banco.debitos.filter((d) => d.pixPendente)

  const porNotinha = new Map()
  const resultado = []

  pendentes.forEach((d) => {
    if (!d.notinhaId) {
      resultado.push({ tipo: 'debito', ...paraDebitoPublico(d) })
      return
    }
    if (!porNotinha.has(d.notinhaId)) porNotinha.set(d.notinhaId, [])
    porNotinha.get(d.notinhaId).push(d)
  })

  porNotinha.forEach((itensPendentes, notinhaId) => {
    const notinha = banco.notinhas.find((n) => n.id === notinhaId)
    if (!notinha) return
    const numero = `#${String(notinha.numeroSequencial).padStart(3, '0')}`
    const todosItensRelevantes = banco.debitos.filter((d) => notinha.itensIds.includes(d.id) && d.status !== 'cancelado')
    const sobraAlgoForaDoPix = todosItensRelevantes.some((d) => d.status === 'cobrado' && !d.pixPendente)
    const totalNotinha = notinha.total
    const totalPendenteAqui = arredondar(itensPendentes.reduce((s, d) => s + d.valor, 0) + (notinha.creditoPixPendente || 0))

    if (!sobraAlgoForaDoPix && notinha.creditoPixPendente === 0 && itensPendentes.length > 1) {
      // A notinha inteira está aguardando confirmação de Pix — agrupa numa linha só.
      resultado.push({
        tipo: 'notinha',
        id: `notinha-${notinha.id}`,
        notinhaId: notinha.id,
        notinhaNumero: numero,
        clienteId: notinha.clienteId,
        clienteNome: clienteLabel(notinha.clienteId),
        descricao: `Notinha inteira (${itensPendentes.length} ${itensPendentes.length === 1 ? 'item' : 'itens'})`,
        valor: totalPendenteAqui,
        totalNotinha,
        obsPagamento: [...new Set(itensPendentes.map((d) => d.obsPagamento).filter(Boolean))].join(' · '),
        atualizadoEm: itensPendentes.reduce((max, d) => (d.atualizadoEm > max ? d.atualizadoEm : max), itensPendentes[0].atualizadoEm),
        debitoIds: itensPendentes.map((d) => d.id),
      })
    } else {
      itensPendentes.forEach((d) => {
        resultado.push({
          tipo: 'debito', ...paraDebitoPublico(d),
          notinhaNumero: numero,
          pixParcialDaNotinha: true,
          totalNotinha,
          totalPendenteNotinha: totalPendenteAqui,
        })
      })
    }
  })

  // Crédito Pix pendente de QUALQUER notinha — processado à parte (não
  // depende de existir algum débito também flagado pixPendente).
  banco.notinhas
    .filter((n) => n.creditoPixPendente > 0)
    .forEach((notinha) => {
      const numero = `#${String(notinha.numeroSequencial).padStart(3, '0')}`
      const itensPendentes = porNotinha.get(notinha.id) || []
      const totalPendenteAqui = arredondar(itensPendentes.reduce((s, d) => s + d.valor, 0) + notinha.creditoPixPendente)
      resultado.push({
        tipo: 'credito-notinha',
        id: `credito-${notinha.id}`,
        notinhaId: notinha.id,
        notinhaNumero: numero,
        clienteId: notinha.clienteId,
        clienteNome: clienteLabel(notinha.clienteId),
        descricao: 'Pagamento parcial via Pix (não fechou nenhum item inteiro)',
        valor: notinha.creditoPixPendente,
        totalNotinha: notinha.total,
        totalPendenteNotinha: totalPendenteAqui,
        atualizadoEm: ultimaMovimentacaoPixDaNotinha(notinha),
      })
    })

  return resultado.sort((a, b) => (a.atualizadoEm < b.atualizadoEm ? 1 : -1))
}

// Data do pagamento via Pix mais recente registrado numa notinha — usada
// só para exibir "marcado em" na linha de crédito pendente (que não está
// presa a nenhum débito específico, então não tem um "atualizadoEm" óbvio).
function ultimaMovimentacaoPixDaNotinha(notinha) {
  const pagamentosPix = notinha.pagamentos.filter((p) => p.pix)
  if (pagamentosPix.length === 0) return notinha.criadoEm
  return pagamentosPix.reduce((maisRecente, p) => (p.criadoEm > maisRecente ? p.criadoEm : maisRecente), pagamentosPix[0].criadoEm)
}

/* --------------------------------------------------------------------------
   Notinhas (faturas mensais que agrupam débitos "em aberto" de um cliente)
   -------------------------------------------------------------------------- */

function paraNotinhaPublica(n) {
  const itens = banco.debitos.filter((d) => n.itensIds.includes(d.id)).map(paraDebitoPublico)

  // Dinheiro (ou qualquer forma que não precisa de conferência bancária) é
  // considerado "pago" na hora. Pix só é considerado "pago" de verdade
  // depois de conferido — enquanto isso, ele entra em "aguardando Pix".
  const itensPagosSoma = itens.filter((i) => i.status === 'pago').reduce((s, i) => s + i.valor, 0)
  const itensPixPendenteSoma = itens.filter((i) => i.pixPendente).reduce((s, i) => s + i.valor, 0)

  // "Total pago" = o que já está de fato confirmado (itens pagos + a sobra
  // de dinheiro que ainda não fechou um item inteiro, mas já foi recebida).
  const totalPago = arredondar(itensPagosSoma + n.creditoAdiantado)
  // "Aguardando Pix" = itens marcados como pagos via Pix mas ainda não
  // conferidos + a sobra de Pix que ainda não fechou um item inteiro.
  const totalPixPendente = arredondar(itensPixPendenteSoma + (n.creditoPixPendente || 0))
  // "Ainda em aberto" = o que falta receber de verdade (não conta o que já
  // está aguardando confirmação de Pix, porque esse dinheiro já foi
  // recebido, só falta bater com o extrato).
  const totalEmAberto = arredondar(n.total - totalPago - totalPixPendente)

  // Status "de exibição": internamente a notinha só vira "paga" quando o
  // pagamento está 100% CONFIRMADO. Mas se ela já foi paga inteira via Pix
  // e só falta conferir o extrato, isso merece um selo próprio na lista —
  // sem isso, ela ficava parecendo "ativa" (como se nada tivesse
  // acontecido), o que confundia o contador.
  const relevantes = itens.filter((i) => i.status !== 'cancelado')
  let statusExibicao = n.status
  if (n.status === 'ativa' && relevantes.length > 0) {
    const nenhumEmAbertoDeVerdade = relevantes.every((i) => i.status === 'pago' || i.pixPendente)
    const temPixPendente = relevantes.some((i) => i.pixPendente) || (n.creditoPixPendente || 0) > 0
    if (nenhumEmAbertoDeVerdade && temPixPendente) statusExibicao = 'pix_a_conferir'
  }

  return {
    ...n,
    numero: `#${String(n.numeroSequencial).padStart(3, '0')}`,
    clienteNome: clienteLabel(n.clienteId),
    itens,
    totalPago,
    totalPixPendente,
    totalAberto: totalEmAberto,
    totalLiquido: totalEmAberto, // valor que ainda falta receber (mantido por compatibilidade com as telas)
    statusExibicao,
  }
}

export async function listarNotinhas({ busca = '', competencia = '', status = 'todas' } = {}) {
  await tick()
  const buscaNorm = busca.trim().toLowerCase()
  return banco.notinhas
    .filter((n) => {
      if (status !== 'todas' && n.status !== status) return false
      if (competencia && n.competencia !== competencia) return false
      if (buscaNorm && !clienteLabel(n.clienteId).toLowerCase().includes(buscaNorm)) return false
      return true
    })
    .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm))
    .map(paraNotinhaPublica)
}

export async function buscarNotinhaPorId(id) {
  await tick()
  const n = banco.notinhas.find((n) => n.id === id)
  return n ? paraNotinhaPublica(n) : null
}

// Gera a próxima notinha do cliente selecionado, agrupando os débitos "em
// aberto" escolhidos. A partir daqui, o status de cada débito vira
// "cobrado" e fica registrada a competência da cobrança.
export async function criarNotinha({ clienteId, competencia, observacoes = '', debitoIds = [], incluirHonorario = false }) {
  await tick()
  if (!clienteId) throw new Error('Selecione o cliente da notinha.')
  if (!competencia || !competencia.trim()) throw new Error('Informe a competência da notinha.')
  if (!competenciaValida(competencia.trim())) throw new Error('Competência inválida — use o formato MM/AAAA (ex.: 04/2026).')
  const cliente0 = banco.clientes.find((c) => c.id === clienteId)
  const temHonorario = incluirHonorario && Number(cliente0?.honorarioEscritorio) > 0
  if ((!debitoIds || debitoIds.length === 0) && !temHonorario) {
    throw new Error('Selecione ao menos um débito em aberto.')
  }

  const itens = banco.debitos.filter((d) => debitoIds.includes(d.id))
  const invalido = itens.find((d) => d.status !== 'aberto' || d.clienteId !== clienteId)
  if (invalido || itens.length !== debitoIds.length) {
    throw new Error('Um ou mais débitos selecionados não estão mais disponíveis (já podem ter sido cobrados por outra notinha).')
  }

  const usuario = usuarioAtualSincrono()

  // Honorário fixo do escritório: se o cliente tiver um valor cadastrado e
  // a opção estiver marcada, criamos um débito "Escritório" na hora e já
  // incluímos ele nessa notinha junto com os selecionados.
  if (incluirHonorario) {
    const cliente = banco.clientes.find((c) => c.id === clienteId)
    const valorHonorario = Number(cliente?.honorarioEscritorio) || 0
    if (valorHonorario > 0) {
      const honorario = {
        id: novoId(), clienteId, propriedadeId: null, descricao: 'Escritório', valor: arredondar(valorHonorario),
        competencia: competencia.trim(), observacao: 'Honorário fixo do escritório', status: 'aberto',
        notinhaId: null, competenciaNotinha: null, pixPendente: false, formaPagamento: null, dataPagamento: null, obsPagamento: null,
        criadoEm: agoraIso(), criadoPor: usuario ? usuario.nome : 'Sistema', atualizadoEm: agoraIso(),
      }
      banco.debitos.push(honorario)
      itens.push(honorario)
    }
  }

  banco.contadorNotinha += 1
  const total = arredondar(itens.reduce((s, d) => s + d.valor, 0))
  const notinha = {
    id: novoId(),
    numeroSequencial: banco.contadorNotinha,
    clienteId,
    competencia: competencia.trim(),
    observacoes: observacoes.trim(),
    itensIds: itens.map((d) => d.id),
    total,
    status: 'ativa',
    creditoAdiantado: 0, // sobra de dinheiro (ou outra forma confirmada) que ainda não fechou um item inteiro
    creditoPixPendente: 0, // sobra de Pix ainda não confirmado que ainda não fechou um item inteiro
    pagamentos: [],
    criadoEm: agoraIso(),
    criadoPor: usuario ? usuario.nome : 'Sistema',
  }
  banco.notinhas.push(notinha)

  // Cada débito vinculado passa a "cobrado" e recebe o id/competência da notinha.
  itens.forEach((d) => {
    d.status = 'cobrado'
    d.notinhaId = notinha.id
    d.competenciaNotinha = competencia.trim()
    d.atualizadoEm = agoraIso()
  })

  registrarHistorico({
    entidade: 'Notinha', entidadeId: notinha.id, entidadeLabel: `${clienteLabel(clienteId)} — notinha #${notinha.numeroSequencial}`,
    acao: 'Gerada', detalhes: `${itens.length} débito(s) · Total R$ ${total.toFixed(2)}`, clienteId,
  })
  persistir()
  return paraNotinhaPublica(notinha)
}

// Edita os dados "de cabeçalho" de uma notinha já criada (competência e
// observações) — não mexe nos itens.
export async function atualizarNotinha(id, dados = {}) {
  await tick()
  const { competencia, observacoes } = dados
  const notinha = banco.notinhas.find((n) => n.id === id)
  if (!notinha) throw new Error('Notinha não encontrada.')
  if (competencia !== undefined && competencia.trim()) {
    if (!competenciaValida(competencia.trim())) throw new Error('Competência inválida — use o formato MM/AAAA (ex.: 04/2026).')
    notinha.competencia = competencia.trim()
    // Mantém os débitos já vinculados com a MESMA competência da notinha —
    // sem isso, esse campo ficava com o valor antigo "por baixo do pano"
    // (não aparece em nenhuma tela hoje, mas vaza no backup .json).
    banco.debitos
      .filter((d) => notinha.itensIds.includes(d.id) && d.status !== 'cancelado')
      .forEach((d) => { d.competenciaNotinha = notinha.competencia })
  }
  if (observacoes !== undefined) notinha.observacoes = observacoes.trim()
  registrarHistorico({
    entidade: 'Notinha', entidadeId: notinha.id, entidadeLabel: `${clienteLabel(notinha.clienteId)} — notinha #${notinha.numeroSequencial}`,
    acao: 'Editada', detalhes: '', clienteId: notinha.clienteId,
  })
  persistir()
  return paraNotinhaPublica(notinha)
}

// Adiciona débitos "em aberto" do MESMO cliente a uma notinha que já
// existe (usado na tela de edição da notinha). A notinha precisa estar
// "ativa" — se estiver "paga", reabra ela primeiro com `reabrirNotinha`.
export async function adicionarDebitosNaNotinha(notinhaId, debitoIds) {
  await tick()
  const notinha = localizarNotinhaAtiva(notinhaId)
  if (!debitoIds || debitoIds.length === 0) throw new Error('Selecione ao menos um débito para adicionar.')

  const itens = banco.debitos.filter((d) => debitoIds.includes(d.id))
  const invalido = itens.find((d) => d.status !== 'aberto' || d.clienteId !== notinha.clienteId)
  if (invalido || itens.length !== debitoIds.length) {
    throw new Error('Um ou mais débitos selecionados não estão mais disponíveis.')
  }

  itens.forEach((d) => {
    d.status = 'cobrado'
    d.notinhaId = notinha.id
    d.competenciaNotinha = notinha.competencia
    d.atualizadoEm = agoraIso()
  })
  notinha.itensIds.push(...itens.map((d) => d.id))
  notinha.total = arredondar(notinha.total + itens.reduce((s, d) => s + d.valor, 0))

  registrarHistorico({
    entidade: 'Notinha', entidadeId: notinha.id, entidadeLabel: `${clienteLabel(notinha.clienteId)} — notinha #${notinha.numeroSequencial}`,
    acao: 'Itens adicionados', detalhes: `${itens.length} débito(s) adicionado(s), totalizando R$ ${itens.reduce((s, d) => s + d.valor, 0).toFixed(2)}`,
    clienteId: notinha.clienteId,
  })
  persistir()
  return paraNotinhaPublica(notinha)
}

// Se, após um pagamento, todos os itens não-cancelados de uma notinha
// estiverem "pago", a notinha inteira é marcada como "paga".
function atualizarStatusNotinhaSeCompleta(notinhaId) {
  const notinha = banco.notinhas.find((n) => n.id === notinhaId)
  if (!notinha) return
  const itens = banco.debitos.filter((d) => notinha.itensIds.includes(d.id))
  const relevantes = itens.filter((d) => d.status !== 'cancelado')
  const todosPagos = relevantes.length > 0 && relevantes.every((d) => d.status === 'pago')
  if (todosPagos && notinha.status === 'ativa') {
    notinha.status = 'paga'
    registrarHistorico({
      entidade: 'Notinha', entidadeId: notinha.id, entidadeLabel: `${clienteLabel(notinha.clienteId)} — notinha #${notinha.numeroSequencial}`,
      acao: 'Quitada', detalhes: '', clienteId: notinha.clienteId,
    })
  }
}

function localizarNotinhaAtiva(id) {
  const notinha = banco.notinhas.find((n) => n.id === id)
  if (!notinha) throw new Error('Notinha não encontrada.')
  if (notinha.status !== 'ativa') throw new Error(`Esta notinha está "${notinha.status}" e não pode ser alterada.`)
  return notinha
}

// "Pagar tudo (dinheiro)": marca todos os itens ainda em aberto (que não
// estejam já aguardando confirmação de Pix) como pagos imediatamente.
//
// Importante: se já existia um pagamento parcial antes (crédito confirmado
// guardado em `creditoAdiantado`), esse valor já é dinheiro que o cliente
// entregou — por isso o valor NOVO cobrado agora é só a diferença que falta
// (total dos itens em aberto menos o crédito já recebido), e não a soma
// cheia dos itens de novo. Sem esse cuidado, o "Total pago" ficava contado
// em dobro.
export async function pagarNotinhaTotalDinheiro(id) {
  await tick()
  const notinha = localizarNotinhaAtiva(id)
  const itens = banco.debitos.filter((d) => notinha.itensIds.includes(d.id) && d.status === 'cobrado' && !d.pixPendente)
  if (itens.length === 0) throw new Error('Não há itens em aberto para pagar nesta notinha (os demais já estão pagos ou aguardando confirmação de Pix).')

  const somaItens = itens.reduce((s, d) => s + d.valor, 0)
  const valorNovoRecebido = arredondar(Math.max(0, somaItens - notinha.creditoAdiantado))
  const hoje = new Date().toISOString().slice(0, 10)
  itens.forEach((d) => {
    d.status = 'pago'
    d.pixPendente = false
    d.formaPagamento = 'Dinheiro'
    d.dataPagamento = hoje
    d.atualizadoEm = agoraIso()
  })
  if (valorNovoRecebido > 0) {
    notinha.pagamentos.push({ id: novoId(), valor: valorNovoRecebido, forma: 'Dinheiro', data: hoje, obs: '', tipo: 'total', pix: false, confirmado: true, criadoEm: agoraIso() })
  }
  notinha.creditoAdiantado = 0 // o crédito que já existia foi todo absorvido nos itens agora quitados
  registrarHistorico({
    entidade: 'Notinha', entidadeId: notinha.id, entidadeLabel: `${clienteLabel(notinha.clienteId)} — notinha #${notinha.numeroSequencial}`,
    acao: 'Paga (dinheiro)', detalhes: `Valor recebido agora: R$ ${valorNovoRecebido.toFixed(2)}`, clienteId: notinha.clienteId,
  })
  atualizarStatusNotinhaSeCompleta(notinha.id) // só fecha de vez se não sobrou nada aguardando Pix
  persistir()
  return paraNotinhaPublica(notinha)
}

// "Pagar tudo (Pix)": os itens ainda em aberto (fora os que já estavam
// aguardando confirmação) ficam com Pix pendente de conferência — eles só
// viram "pago" (e a notinha só fecha) depois que o contador confirmar o
// extrato na tela "Conferir Pix". `obs` é opcional.
//
// Mesma lógica de crédito do "pagar tudo em dinheiro": se já havia um
// crédito Pix pendente de um pagamento parcial anterior, o valor novo
// registrado é só a diferença.
export async function pagarNotinhaTotalPix(id, obs = '') {
  await tick()
  const notinha = localizarNotinhaAtiva(id)
  const itens = banco.debitos.filter((d) => notinha.itensIds.includes(d.id) && d.status === 'cobrado' && !d.pixPendente)
  if (itens.length === 0) throw new Error('Não há itens em aberto para marcar via Pix nesta notinha.')

  const somaItens = itens.reduce((s, d) => s + d.valor, 0)
  const valorNovo = arredondar(Math.max(0, somaItens - notinha.creditoPixPendente))
  itens.forEach((d) => {
    d.pixPendente = true
    if (obs) d.obsPagamento = obs
    d.atualizadoEm = agoraIso()
  })
  if (valorNovo > 0) {
    notinha.pagamentos.push({ id: novoId(), valor: valorNovo, forma: 'Pix', data: '', obs, tipo: 'total', pix: true, confirmado: false, criadoEm: agoraIso() })
  }
  notinha.creditoPixPendente = 0 // o crédito pendente que já existia foi absorvido nos itens agora marcados
  registrarHistorico({
    entidade: 'Notinha', entidadeId: notinha.id, entidadeLabel: `${clienteLabel(notinha.clienteId)} — notinha #${notinha.numeroSequencial}`,
    acao: 'Pix aguardando conferência (total)', detalhes: obs || `${itens.length} item(ns)`, clienteId: notinha.clienteId,
  })
  persistir()
  return paraNotinhaPublica(notinha)
}

// "Pagar parcial": o valor informado é abatido dos itens da notinha, em
// ordem (do mais antigo para o mais novo).
//
// - Se a forma NÃO for Pix: cada item quitado por inteiro já vira "pago" na
//   hora; o que sobra sem fechar um item inteiro fica guardado como
//   "crédito adiantado" (dinheiro já recebido, só não fechou um item
//   sozinho ainda).
// - Se a forma FOR Pix: os itens quitados ficam "aguardando conferência"
//   (não viram "pago" ainda) e vão para a tela Conferir Pix; a sobra fica
//   guardada como "crédito Pix pendente", só virando crédito de verdade
//   quando o Pix for conferido.
//
// Em qualquer caso, o "Total pago" exibido reflete o valor realmente
// informado no pagamento — não só a soma dos itens que já fecharam
// sozinhos (por isso o crédito entra na conta de `paraNotinhaPublica`).
export async function pagarNotinhaParcial(id, { valor, forma = 'Dinheiro', data = '', obs = '' }) {
  await tick()
  const notinha = localizarNotinhaAtiva(id)
  const valorPago = arredondar(valor)
  if (!valorPago || valorPago <= 0) throw new Error('Informe um valor de pagamento maior que zero.')

  // Nunca deixamos pagar mais do que realmente falta — sobrepagar criaria
  // um "crédito" que não pertence a nenhum item e pode acabar se perdendo
  // depois. Se o valor bate certinho (ou passa perto por causa de
  // arredondamento de centavos), deixamos passar.
  const { totalAberto } = paraNotinhaPublica(notinha)
  if (valorPago > totalAberto + 0.01) {
    throw new Error(`O valor informado (R$ ${valorPago.toFixed(2)}) é maior do que o saldo em aberto desta notinha (R$ ${totalAberto.toFixed(2)}). Se é para quitar tudo, use "Pagar tudo".`)
  }

  const ehPix = forma === 'Pix'

  let saldoDisponivel = (ehPix ? notinha.creditoPixPendente : notinha.creditoAdiantado) + valorPago
  const itens = banco.debitos
    .filter((d) => notinha.itensIds.includes(d.id) && d.status === 'cobrado' && !d.pixPendente)
    .sort((a, b) => new Date(a.criadoEm) - new Date(b.criadoEm))

  const hoje = data || new Date().toISOString().slice(0, 10)
  let algumQuitado = false
  for (const item of itens) {
    if (saldoDisponivel >= item.valor) {
      if (ehPix) {
        item.pixPendente = true
        item.obsPagamento = obs
      } else {
        item.status = 'pago'
        item.pixPendente = false
        item.formaPagamento = forma
        item.dataPagamento = hoje
        item.obsPagamento = obs
      }
      item.atualizadoEm = agoraIso()
      saldoDisponivel -= item.valor
      algumQuitado = true
    } else {
      break
    }
  }

  if (ehPix) {
    notinha.creditoPixPendente = arredondar(saldoDisponivel)
  } else {
    notinha.creditoAdiantado = arredondar(saldoDisponivel)
  }
  notinha.pagamentos.push({ id: novoId(), valor: valorPago, forma, data: hoje, obs, tipo: 'parcial', pix: ehPix, confirmado: !ehPix, criadoEm: agoraIso() })

  registrarHistorico({
    entidade: 'Notinha', entidadeId: notinha.id, entidadeLabel: `${clienteLabel(notinha.clienteId)} — notinha #${notinha.numeroSequencial}`,
    acao: ehPix ? 'Pix aguardando conferência (parcial)' : 'Pagamento parcial',
    detalhes: `R$ ${valorPago.toFixed(2)} · ${forma}${algumQuitado ? '' : ' (valor insuficiente para quitar um item; guardado como crédito)'}${obs ? ` · ${obs}` : ''}`,
    clienteId: notinha.clienteId,
  })

  if (!ehPix) atualizarStatusNotinhaSeCompleta(notinha.id)
  persistir()
  return paraNotinhaPublica(notinha)
}

// Estorna a notinha inteira: todos os itens não cancelados voltam para
// "em aberto" (perdem o vínculo com a notinha) e a notinha fica marcada
// como "estornada" — ela nunca é apagada, para manter o rastro completo.
export async function estornarNotinha(id, motivo = '') {
  await tick()
  const notinha = banco.notinhas.find((n) => n.id === id)
  if (!notinha) throw new Error('Notinha não encontrada.')
  if (notinha.status === 'estornada') throw new Error('Esta notinha já está estornada.')

  const itens = banco.debitos.filter((d) => notinha.itensIds.includes(d.id) && d.status !== 'cancelado')
  const idsDetach = itens.map((d) => d.id)
  itens.forEach((d) => {
    d.status = 'aberto'
    d.notinhaId = null
    d.competenciaNotinha = null
    d.pixPendente = false
    d.formaPagamento = null
    d.dataPagamento = null
    d.obsPagamento = null
    d.atualizadoEm = agoraIso()
  })
  // Tira da lista da notinha os itens que acabaram de se desvincular (os
  // "cancelados" continuam lá, só pra registro). Sem isso, essa notinha
  // "estornada" ficaria mostrando pra sempre o estado ATUAL desses
  // débitos — inclusive depois deles serem reaproveitados em outra
  // notinha, o que misturaria o histórico de duas notinhas diferentes.
  notinha.itensIds = notinha.itensIds.filter((itemId) => !idsDetach.includes(itemId))
  notinha.creditoAdiantado = 0
  notinha.creditoPixPendente = 0
  notinha.status = 'estornada'
  registrarHistorico({
    entidade: 'Notinha', entidadeId: notinha.id, entidadeLabel: `${clienteLabel(notinha.clienteId)} — notinha #${notinha.numeroSequencial}`,
    acao: 'Estornada', detalhes: motivo, clienteId: notinha.clienteId,
  })
  persistir()
  return paraNotinhaPublica(notinha)
}

// Reabre uma notinha que já estava "paga" (por exemplo, se o contador
// clicou em "Pagar tudo" sem querer). Diferente do estorno, os débitos
// CONTINUAM vinculados a essa notinha — só o pagamento é desfeito, para o
// contador poder corrigir e pagar do jeito certo.
export async function reabrirNotinha(id, motivo = '') {
  await tick()
  const notinha = banco.notinhas.find((n) => n.id === id)
  if (!notinha) throw new Error('Notinha não encontrada.')
  if (notinha.status !== 'paga') throw new Error('Só é possível reabrir uma notinha que está paga.')

  const itens = banco.debitos.filter((d) => notinha.itensIds.includes(d.id) && d.status !== 'cancelado')
  itens.forEach((d) => {
    d.status = 'cobrado'
    d.pixPendente = false
    d.formaPagamento = null
    d.dataPagamento = null
    d.obsPagamento = null
    d.atualizadoEm = agoraIso()
  })
  notinha.status = 'ativa'
  notinha.creditoAdiantado = 0
  notinha.creditoPixPendente = 0
  registrarHistorico({
    entidade: 'Notinha', entidadeId: notinha.id, entidadeLabel: `${clienteLabel(notinha.clienteId)} — notinha #${notinha.numeroSequencial}`,
    acao: 'Reaberta', detalhes: motivo, clienteId: notinha.clienteId,
  })
  persistir()
  return paraNotinhaPublica(notinha)
}

/* --------------------------------------------------------------------------
   Dashboard
   -------------------------------------------------------------------------- */

export async function obterMetricasDashboard(competencia) {
  await tick()
  const doMes = banco.debitos.filter((d) => d.competencia === competencia)
  const emAberto = doMes.filter((d) => d.status === 'aberto')
  // "Cobrado" aqui exclui os que já estão com Pix pendente — esses têm o
  // próprio cartão logo ao lado, então contá-los nos dois ao mesmo tempo
  // exageraria o total "cobrado" (dinheiro que já pode ter caído na conta
  // não deveria contar como "ainda por cobrar").
  const cobrados = doMes.filter((d) => d.status === 'cobrado' && !d.pixPendente)
  const pagos = doMes.filter((d) => d.status === 'pago')
  const cancelados = doMes.filter((d) => d.status === 'cancelado')
  // Igual ao resto do painel, "Pix aguardando conferência" também respeita
  // a competência escolhida (a página inteira é um "resumo da competência
  // X"). Para ver TODOS os pendentes de Pix, independente do mês, use a
  // tela "Conferir Pix", que é justamente pra isso.
  const pixPendentes = doMes.filter((d) => d.pixPendente)

  const notinhasDoMes = banco.notinhas.filter((n) => n.competencia === competencia)
  const notinhasAtivas = notinhasDoMes.filter((n) => n.status === 'ativa')
  const notinhasPagas = notinhasDoMes.filter((n) => n.status === 'paga')

  // Top 5 clientes com maior valor em aberto (considerando TODOS os débitos
  // em aberto, não só os da competência filtrada — é uma visão de risco).
  const somaPorCliente = new Map()
  banco.debitos
    .filter((d) => d.status === 'aberto')
    .forEach((d) => {
      somaPorCliente.set(d.clienteId, (somaPorCliente.get(d.clienteId) || { total: 0, qtd: 0 }))
      const atual = somaPorCliente.get(d.clienteId)
      atual.total = arredondar(atual.total + d.valor)
      atual.qtd += 1
    })
  const topInadimplentes = [...somaPorCliente.entries()]
    .map(([clienteId, v]) => ({ clienteId, nome: clienteLabel(clienteId), total: v.total, qtd: v.qtd }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)

  return {
    emAberto: { total: soma(emAberto), qtd: emAberto.length },
    cobrado: { total: soma(cobrados), qtd: cobrados.length },
    pago: { total: soma(pagos), qtd: pagos.length },
    pixPendente: { total: soma(pixPendentes), qtd: pixPendentes.length },
    notinhasAtivas: notinhasAtivas.length,
    notinhasPagas: notinhasPagas.length,
    totalFaturado: arredondar(soma(emAberto) + soma(cobrados) + soma(pagos)),
    cancelado: { total: soma(cancelados), qtd: cancelados.length },
    topInadimplentes,
  }
}

function soma(lista) {
  return arredondar(lista.reduce((s, d) => s + d.valor, 0))
}

/* --------------------------------------------------------------------------
   Busca global
   -------------------------------------------------------------------------- */

export async function buscaGlobal(texto) {
  await tick()
  const t = texto.trim().toLowerCase()
  if (!t) return { clientes: [], debitos: [], notinhas: [] }

  const clientes = banco.clientes
    .filter((c) => c.nome.toLowerCase().includes(t) || (c.cpf || '').toLowerCase().includes(t))
    .map(paraClientePublico)

  const debitos = banco.debitos
    .filter((d) => {
      const numeroNotinha = d.notinhaId ? String(banco.notinhas.find((n) => n.id === d.notinhaId)?.numeroSequencial || '') : ''
      return (
        d.descricao.toLowerCase().includes(t) ||
        d.competencia.toLowerCase().includes(t) ||
        clienteLabel(d.clienteId).toLowerCase().includes(t) ||
        String(d.valor).includes(t) ||
        numeroNotinha.includes(t.replace('#', ''))
      )
    })
    .map(paraDebitoPublico)

  const notinhas = banco.notinhas
    .filter((n) => {
      const numero = String(n.numeroSequencial).padStart(3, '0')
      return (
        clienteLabel(n.clienteId).toLowerCase().includes(t) ||
        n.competencia.toLowerCase().includes(t) ||
        numero.includes(t.replace('#', '')) ||
        `#${numero}`.includes(t)
      )
    })
    .map(paraNotinhaPublica)

  return { clientes, debitos, notinhas }
}

/* --------------------------------------------------------------------------
   Backup / exportação de dados
   -------------------------------------------------------------------------- */

// Devolve todos os dados do sistema já "achatados" e com os nomes
// resolvidos (cliente, propriedade, notinha), prontos para virar um
// arquivo .json (backup completo) ou uma planilha .xlsx (tabelas
// detalhadas). Usado pela tela de Backup.
export async function obterDadosParaExportacao() {
  await tick()
  return {
    geradoEm: agoraIso(),
    clientes: banco.clientes.map((c) => ({ ...c })),
    propriedades: banco.propriedades.map((p) => ({ ...p, clienteNome: clienteLabel(p.clienteId) })),
    debitos: banco.debitos.map((d) => paraDebitoPublico(d)),
    notinhas: banco.notinhas.map((n) => {
      const publica = paraNotinhaPublica(n)
      return { ...publica, itens: undefined, quantidadeItens: publica.itens.length }
    }),
    notinhaItens: banco.notinhas.flatMap((n) =>
      banco.debitos
        .filter((d) => n.itensIds.includes(d.id))
        .map((d) => ({ notinha: `#${String(n.numeroSequencial).padStart(3, '0')}`, ...paraDebitoPublico(d) }))
    ),
    historico: banco.historico.map((h) => ({ ...h })),
  }
}

// Este é o backup "de verdade" — os dados BRUTOS, exatamente como o
// sistema guarda internamente (diferente da função acima, que já
// "traduz" tudo para exibição/Excel e por isso perde informação demais
// para conseguir voltar atrás). É esse formato que dá pra restaurar
// depois com `restaurarBackupCompleto`.
const VERSAO_BACKUP = 1

export async function exportarBackupCompleto() {
  await tick()
  return {
    tipo: 'crediario-digital-backup',
    versao: VERSAO_BACKUP,
    geradoEm: agoraIso(),
    clientes: banco.clientes,
    propriedades: banco.propriedades,
    debitos: banco.debitos,
    notinhas: banco.notinhas,
    historico: banco.historico,
    contadorNotinha: banco.contadorNotinha,
  }
}

// Restaura um backup gerado pela função acima. Por segurança, isso NÃO
// mexe nos usuários nem na sessão atual — só troca os dados "de negócio"
// (clientes, débitos, notinhas, histórico). Assim, ninguém consegue
// travar o próprio login importando um backup antigo por engano.
export async function restaurarBackupCompleto(dados) {
  await tick()
  const usuario = usuarioAtualSincrono()
  if (usuario?.papel !== 'administrador') {
    throw new Error('Apenas o administrador pode restaurar um backup.')
  }
  if (!dados || dados.tipo !== 'crediario-digital-backup') {
    throw new Error('Este arquivo não parece ser um backup válido do Crediário Digital.')
  }
  if (!Array.isArray(dados.clientes) || !Array.isArray(dados.debitos) || !Array.isArray(dados.notinhas)) {
    throw new Error('O arquivo de backup está incompleto ou corrompido.')
  }

  banco.clientes = dados.clientes
  banco.propriedades = dados.propriedades || []
  banco.debitos = dados.debitos
  banco.notinhas = dados.notinhas
  banco.historico = dados.historico || []
  banco.contadorNotinha = dados.contadorNotinha || banco.notinhas.length
  migrarBanco(banco) // preenche campos que talvez não existissem num backup mais antigo

  registrarHistorico({
    entidade: 'Sistema', entidadeId: 'backup', entidadeLabel: 'Restauração de backup',
    acao: 'Backup restaurado', detalhes: `Backup gerado em ${formatarDataSimples(dados.geradoEm)}`,
  })
  persistir()
}

function formatarDataSimples(iso) {
  if (!iso) return 'data desconhecida'
  try {
    return new Date(iso).toLocaleString('pt-BR')
  } catch {
    return iso
  }
}
