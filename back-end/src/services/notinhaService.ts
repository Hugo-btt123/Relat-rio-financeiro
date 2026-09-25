import * as notinhaRepository from '../repositories/notinhaRepository.js'
import * as debitoRepository from '../repositories/debitoRepository.js'
import * as pagamentoRepository from '../repositories/pagamentoRepository.js'
import * as clienteService from './clienteService.js'
import * as historicoService from './historicoService.js'
import { NotFoundError } from '../errors/NotFoundError.js'
import { ConflictError } from '../errors/ConflictError.js'
import { ValidationError } from '../errors/ValidationError.js'
import { arredondar } from '../utils/dinheiro.js'
import { competenciaValida } from '../utils/competencia.js'
import type { Prisma } from '../../generated/prisma/client.js'
import { paraNotinhaPublica, type NotinhaComRelacoes } from '../dto/notinha/notinhaDto.js'

function numero(notinhaId: number): string {
  return `#${String(notinhaId).padStart(3, '0')}`
}

// Se, após uma mudança, todos os itens não-cancelados de uma notinha estiverem
// "pago", a notinha inteira é marcada como "paga". Espelha
// atualizarStatusNotinhaSeCompleta em front-end/src/lib/db.js.
export async function atualizarStatusSeCompleta(notinhaId: number, operador?: string): Promise<void> {
  const notinha = await notinhaRepository.buscarPorId(notinhaId)
  if (!notinha) return

  const itens = await notinhaRepository.listarItens(notinhaId)
  const relevantes = itens.filter((d) => d.status !== 'cancelado')
  const todosPagos = relevantes.length > 0 && relevantes.every((d) => d.status === 'pago')

  if (todosPagos && notinha.status === 'ativa') {
    await notinhaRepository.atualizar(notinhaId, { status: 'paga' })
    await historicoService.registrar({
      entidade: 'Notinha',
      entidadeId: notinha.id,
      entidadeLabel: `${notinha.cliente.nome} — notinha ${numero(notinha.id)}`,
      acao: 'Quitada',
      clienteId: notinha.clienteId,
      operador,
    })
  }
}

async function buscarAtivaOuFalhar(id: number): Promise<NotinhaComRelacoes> {
  const notinha = await notinhaRepository.buscarPorId(id)
  if (!notinha) throw new NotFoundError('Notinha não encontrada.')
  if (notinha.status !== 'ativa') {
    throw new ConflictError(`Esta notinha está "${notinha.status}" e não pode ser alterada.`)
  }
  return notinha
}

export interface ListarNotinhasParams {
  busca?: string
  competencia?: string
  status?: string
}

export async function listar({ busca = '', competencia = '', status = 'todas' }: ListarNotinhasParams) {
  const where: Prisma.NotinhaWhereInput = {}
  if (status !== 'todas') where.status = status as Prisma.EnumStatusNotinhaFilter['equals']
  if (competencia) where.competencia = competencia
  const termo = busca.trim()
  if (termo) where.cliente = { nome: { contains: termo, mode: 'insensitive' } }
  return notinhaRepository.listar(where)
}

export async function buscarPorId(id: number): Promise<NotinhaComRelacoes> {
  const notinha = await notinhaRepository.buscarPorId(id)
  if (!notinha) throw new NotFoundError('Notinha não encontrada.')
  return notinha
}

export interface CriarNotinhaInput {
  clienteId: number
  competencia: string
  observacoes?: string
  debitoIds?: number[]
  incluirHonorario?: boolean
}

export async function criar(input: CriarNotinhaInput, operador?: string): Promise<NotinhaComRelacoes> {
  if (!input.clienteId) throw new ValidationError('Selecione o cliente da notinha.')
  if (!input.competencia || !input.competencia.trim()) throw new ValidationError('Informe a competência da notinha.')
  const competencia = input.competencia.trim()
  if (!competenciaValida(competencia)) {
    throw new ValidationError('Competência inválida — use o formato MM/AAAA (ex.: 04/2026).')
  }

  const cliente = await clienteService.buscarPorId(input.clienteId)

  const debitoIds = input.debitoIds ?? []
  const temHonorario = !!input.incluirHonorario && Number(cliente.honorarioEscritorio) > 0
  if (debitoIds.length === 0 && !temHonorario) {
    throw new ValidationError('Selecione ao menos um débito em aberto.')
  }

  const selecionados = debitoIds.length > 0 ? await debitoRepository.buscarPorIds(debitoIds) : []
  const invalido = selecionados.find((d) => d.status !== 'aberto' || d.clienteId !== input.clienteId)
  if (invalido || selecionados.length !== debitoIds.length) {
    throw new ConflictError(
      'Um ou mais débitos selecionados não estão mais disponíveis (já podem ter sido cobrados por outra notinha).',
    )
  }

  const valorHonorario = input.incluirHonorario ? Number(cliente.honorarioEscritorio) || 0 : 0
  const somaSelecionados = selecionados.reduce((s, d) => s + Number(d.valor), 0)
  const total = arredondar(somaSelecionados + valorHonorario)

  const notinhaCriada = await notinhaRepository.criar({
    cliente: { connect: { id: input.clienteId } },
    competencia,
    observacoes: input.observacoes?.trim() ?? '',
    total,
    status: 'ativa',
    criadoPor: operador ?? 'Sistema',
  })

  if (valorHonorario > 0) {
    await debitoRepository.criar({
      cliente: { connect: { id: input.clienteId } },
      descricao: 'Escritório',
      valor: arredondar(valorHonorario),
      competencia,
      observacao: 'Honorário fixo do escritório',
      status: 'cobrado',
      notinha: { connect: { id: notinhaCriada.id } },
      competenciaNotinha: competencia,
      criadoPor: operador ?? 'Sistema',
    })
  }

  if (selecionados.length > 0) {
    await debitoRepository.atualizarMuitos(
      selecionados.map((d) => d.id),
      { status: 'cobrado', notinhaId: notinhaCriada.id, competenciaNotinha: competencia },
    )
  }

  const notinhaCompleta = await buscarPorId(notinhaCriada.id)

  await historicoService.registrar({
    entidade: 'Notinha',
    entidadeId: notinhaCompleta.id,
    entidadeLabel: `${cliente.nome} — notinha ${numero(notinhaCompleta.id)}`,
    acao: 'Gerada',
    detalhes: `${notinhaCompleta.debitos.length} débito(s) · Total R$ ${total.toFixed(2)}`,
    clienteId: input.clienteId,
    operador,
  })

  return notinhaCompleta
}

export interface AtualizarNotinhaInput {
  competencia?: string
  observacoes?: string
}

export async function atualizar(id: number, input: AtualizarNotinhaInput, operador?: string): Promise<NotinhaComRelacoes> {
  const notinha = await buscarPorId(id)

  const data: Prisma.NotinhaUpdateInput = {}
  let novaCompetencia: string | undefined
  if (input.competencia !== undefined && input.competencia.trim()) {
    novaCompetencia = input.competencia.trim()
    if (!competenciaValida(novaCompetencia)) {
      throw new ValidationError('Competência inválida — use o formato MM/AAAA (ex.: 04/2026).')
    }
    data.competencia = novaCompetencia
  }
  if (input.observacoes !== undefined) data.observacoes = input.observacoes.trim()

  await notinhaRepository.atualizar(id, data)

  if (novaCompetencia) {
    await debitoRepository.atualizarMuitosPorNotinha(id, { competenciaNotinha: novaCompetencia })
  }

  await historicoService.registrar({
    entidade: 'Notinha',
    entidadeId: notinha.id,
    entidadeLabel: `${notinha.cliente.nome} — notinha ${numero(notinha.id)}`,
    acao: 'Editada',
    clienteId: notinha.clienteId,
    operador,
  })

  return buscarPorId(id)
}

export async function adicionarDebitos(id: number, debitoIds: number[], operador?: string): Promise<NotinhaComRelacoes> {
  const notinha = await buscarAtivaOuFalhar(id)
  if (!debitoIds || debitoIds.length === 0) {
    throw new ValidationError('Selecione ao menos um débito para adicionar.')
  }

  const selecionados = await debitoRepository.buscarPorIds(debitoIds)
  const invalido = selecionados.find((d) => d.status !== 'aberto' || d.clienteId !== notinha.clienteId)
  if (invalido || selecionados.length !== debitoIds.length) {
    throw new ConflictError('Um ou mais débitos selecionados não estão mais disponíveis.')
  }

  await debitoRepository.atualizarMuitos(debitoIds, {
    status: 'cobrado',
    notinhaId: notinha.id,
    competenciaNotinha: notinha.competencia,
  })

  const somaAdicionada = selecionados.reduce((s, d) => s + Number(d.valor), 0)
  await notinhaRepository.atualizar(notinha.id, { total: arredondar(Number(notinha.total) + somaAdicionada) })

  await historicoService.registrar({
    entidade: 'Notinha',
    entidadeId: notinha.id,
    entidadeLabel: `${notinha.cliente.nome} — notinha ${numero(notinha.id)}`,
    acao: 'Itens adicionados',
    detalhes: `${selecionados.length} débito(s) adicionado(s), totalizando R$ ${somaAdicionada.toFixed(2)}`,
    clienteId: notinha.clienteId,
    operador,
  })

  return buscarPorId(id)
}

export async function estornar(id: number, motivo = '', operador?: string): Promise<NotinhaComRelacoes> {
  const notinha = await buscarPorId(id)
  if (notinha.status === 'estornada') throw new ConflictError('Esta notinha já está estornada.')

  const idsParaDesvincular = notinha.debitos.filter((d) => d.status !== 'cancelado').map((d) => d.id)
  if (idsParaDesvincular.length > 0) {
    await debitoRepository.atualizarMuitos(idsParaDesvincular, {
      status: 'aberto',
      notinhaId: null,
      competenciaNotinha: null,
      pixPendente: false,
      formaPagamento: null,
      dataPagamento: null,
      obsPagamento: null,
    })
  }

  await notinhaRepository.atualizar(id, { status: 'estornada', creditoAdiantado: 0, creditoPixPendente: 0 })

  await historicoService.registrar({
    entidade: 'Notinha',
    entidadeId: notinha.id,
    entidadeLabel: `${notinha.cliente.nome} — notinha ${numero(notinha.id)}`,
    acao: 'Estornada',
    detalhes: motivo,
    clienteId: notinha.clienteId,
    operador,
  })

  return buscarPorId(id)
}

export async function reabrir(id: number, motivo = '', operador?: string): Promise<NotinhaComRelacoes> {
  const notinha = await buscarPorId(id)
  if (notinha.status !== 'paga') throw new ConflictError('Só é possível reabrir uma notinha que está paga.')

  const idsParaReabrir = notinha.debitos.filter((d) => d.status !== 'cancelado').map((d) => d.id)
  if (idsParaReabrir.length > 0) {
    await debitoRepository.atualizarMuitos(idsParaReabrir, {
      status: 'cobrado',
      pixPendente: false,
      formaPagamento: null,
      dataPagamento: null,
      obsPagamento: null,
    })
  }

  await notinhaRepository.atualizar(id, { status: 'ativa', creditoAdiantado: 0, creditoPixPendente: 0 })

  await historicoService.registrar({
    entidade: 'Notinha',
    entidadeId: notinha.id,
    entidadeLabel: `${notinha.cliente.nome} — notinha ${numero(notinha.id)}`,
    acao: 'Reaberta',
    detalhes: motivo,
    clienteId: notinha.clienteId,
    operador,
  })

  return buscarPorId(id)
}

// "Pagar tudo (dinheiro)": fecha os itens ainda simplesmente "cobrados"
// (ignora os que já estão com Pix pendente). Desconta o crédito que já
// existia antes de cobrar o valor "novo" — bug #3 do CONTRATO-BACKEND-IA.md
// (cobrar de novo o valor cheio, ignorando o crédito já recebido, conta
// dinheiro em dobro).
export async function pagarTotalDinheiro(id: number, operador?: string): Promise<NotinhaComRelacoes> {
  const notinha = await buscarAtivaOuFalhar(id)
  const itens = notinha.debitos.filter((d) => d.status === 'cobrado' && !d.pixPendente)
  if (itens.length === 0) {
    throw new ConflictError(
      'Não há itens em aberto para pagar nesta notinha (os demais já estão pagos ou aguardando confirmação de Pix).',
    )
  }

  const somaItens = itens.reduce((s, d) => s + Number(d.valor), 0)
  const valorNovoRecebido = arredondar(Math.max(0, somaItens - Number(notinha.creditoAdiantado)))
  const hoje = new Date()

  await debitoRepository.atualizarMuitos(
    itens.map((d) => d.id),
    { status: 'pago', pixPendente: false, formaPagamento: 'Dinheiro', dataPagamento: hoje },
  )

  if (valorNovoRecebido > 0) {
    await pagamentoRepository.criar({
      notinha: { connect: { id: notinha.id } },
      valor: valorNovoRecebido,
      forma: 'Dinheiro',
      data: hoje,
      obs: '',
      tipo: 'total',
      pix: false,
      confirmado: true,
    })
  }

  await notinhaRepository.atualizar(notinha.id, { creditoAdiantado: 0 })

  await historicoService.registrar({
    entidade: 'Notinha',
    entidadeId: notinha.id,
    entidadeLabel: `${notinha.cliente.nome} — notinha ${numero(notinha.id)}`,
    acao: 'Paga (dinheiro)',
    detalhes: `Valor recebido agora: R$ ${valorNovoRecebido.toFixed(2)}`,
    clienteId: notinha.clienteId,
    operador,
  })

  await atualizarStatusSeCompleta(notinha.id, operador)

  return buscarPorId(id)
}

// "Pagar tudo (Pix)": os itens ainda em aberto ficam com Pix pendente de
// conferência (NUNCA fecham na hora — só via confirmar-pix/confirmar-pix-lote
// ou a fila /pix-pendentes). Mesmo desconto de crédito pré-existente do
// "pagar tudo dinheiro", mas no pote de Pix.
export async function pagarTotalPix(id: number, obs = '', operador?: string): Promise<NotinhaComRelacoes> {
  const notinha = await buscarAtivaOuFalhar(id)
  const itens = notinha.debitos.filter((d) => d.status === 'cobrado' && !d.pixPendente)
  if (itens.length === 0) {
    throw new ConflictError('Não há itens em aberto para marcar via Pix nesta notinha.')
  }

  const somaItens = itens.reduce((s, d) => s + Number(d.valor), 0)
  const valorNovo = arredondar(Math.max(0, somaItens - Number(notinha.creditoPixPendente)))

  const dadosItens: Prisma.DebitoUncheckedUpdateManyInput = { pixPendente: true }
  if (obs) dadosItens.obsPagamento = obs
  await debitoRepository.atualizarMuitos(
    itens.map((d) => d.id),
    dadosItens,
  )

  if (valorNovo > 0) {
    await pagamentoRepository.criar({
      notinha: { connect: { id: notinha.id } },
      valor: valorNovo,
      forma: 'Pix',
      data: null,
      obs,
      tipo: 'total',
      pix: true,
      confirmado: false,
    })
  }

  await notinhaRepository.atualizar(notinha.id, { creditoPixPendente: 0 })

  await historicoService.registrar({
    entidade: 'Notinha',
    entidadeId: notinha.id,
    entidadeLabel: `${notinha.cliente.nome} — notinha ${numero(notinha.id)}`,
    acao: 'Pix aguardando conferência (total)',
    detalhes: obs || `${itens.length} item(ns)`,
    clienteId: notinha.clienteId,
    operador,
  })

  return buscarPorId(id)
}

export interface PagarParcialInput {
  valor: number
  forma?: string
  data?: string
  obs?: string
}

// Abate o valor pago dos itens em ordem cronológica (mais antigo primeiro).
// Um item só fecha quando o saldo disponível (crédito existente + valor
// novo) cobre ele por inteiro; o resto vira crédito (adiantado ou Pix
// pendente, conforme a forma). Nunca aceita mais do que o saldo em aberto
// (bug #4). Arredonda tudo antes de persistir (bug #6).
export async function pagarParcial(id: number, input: PagarParcialInput, operador?: string): Promise<NotinhaComRelacoes> {
  const notinha = await buscarAtivaOuFalhar(id)
  const valorPago = arredondar(input.valor)
  if (!valorPago || valorPago <= 0) throw new ValidationError('Informe um valor de pagamento maior que zero.')

  const publica = paraNotinhaPublica(notinha)
  if (valorPago > publica.totalAberto + 0.01) {
    throw new ConflictError(
      `O valor informado (R$ ${valorPago.toFixed(2)}) é maior do que o saldo em aberto desta notinha (R$ ${publica.totalAberto.toFixed(2)}). Se é para quitar tudo, use "Pagar tudo".`,
    )
  }

  const forma = input.forma ?? 'Dinheiro'
  const ehPix = forma === 'Pix'
  const obs = input.obs ?? ''

  let saldoDisponivel = (ehPix ? Number(notinha.creditoPixPendente) : Number(notinha.creditoAdiantado)) + valorPago
  const itens = notinha.debitos
    .filter((d) => d.status === 'cobrado' && !d.pixPendente)
    .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime())

  const hoje = input.data ? new Date(input.data) : new Date()
  let algumQuitado = false

  for (const item of itens) {
    const valorItem = Number(item.valor)
    if (saldoDisponivel < valorItem) break

    if (ehPix) {
      await debitoRepository.atualizar(item.id, { pixPendente: true, obsPagamento: obs })
    } else {
      await debitoRepository.atualizar(item.id, {
        status: 'pago',
        pixPendente: false,
        formaPagamento: forma,
        dataPagamento: hoje,
        obsPagamento: obs,
      })
    }
    saldoDisponivel -= valorItem
    algumQuitado = true
  }

  const dadosNotinha: Prisma.NotinhaUpdateInput = ehPix
    ? { creditoPixPendente: arredondar(saldoDisponivel) }
    : { creditoAdiantado: arredondar(saldoDisponivel) }
  await notinhaRepository.atualizar(notinha.id, dadosNotinha)

  await pagamentoRepository.criar({
    notinha: { connect: { id: notinha.id } },
    valor: valorPago,
    forma,
    data: hoje,
    obs,
    tipo: 'parcial',
    pix: ehPix,
    confirmado: !ehPix,
  })

  await historicoService.registrar({
    entidade: 'Notinha',
    entidadeId: notinha.id,
    entidadeLabel: `${notinha.cliente.nome} — notinha ${numero(notinha.id)}`,
    acao: ehPix ? 'Pix aguardando conferência (parcial)' : 'Pagamento parcial',
    detalhes: `R$ ${valorPago.toFixed(2)} · ${forma}${algumQuitado ? '' : ' (valor insuficiente para quitar um item; guardado como crédito)'}${obs ? ` · ${obs}` : ''}`,
    clienteId: notinha.clienteId,
    operador,
  })

  if (!ehPix) await atualizarStatusSeCompleta(notinha.id, operador)

  return buscarPorId(id)
}

// Confirma um "crédito Pix" que não fechou nenhum item inteiro (ex.: pagou
// parcial R$500 de uma notinha de R$1.500 via Pix, e nenhum item isolado
// custa R$500 ou menos). Esse valor não está preso a nenhum débito
// específico — por isso tem confirmação própria (bug #5: sem essa rota, um
// Pix pequeno demais fica invisível e nunca é confirmado).
export async function confirmarCreditoPix(id: number, operador?: string): Promise<NotinhaComRelacoes> {
  const notinha = await buscarPorId(id)
  const creditoPixPendente = Number(notinha.creditoPixPendente)
  if (!creditoPixPendente) {
    throw new ConflictError('Não há crédito Pix pendente de conferência nesta notinha.')
  }

  await notinhaRepository.atualizar(id, {
    creditoAdiantado: arredondar(Number(notinha.creditoAdiantado) + creditoPixPendente),
    creditoPixPendente: 0,
  })

  await historicoService.registrar({
    entidade: 'Notinha',
    entidadeId: notinha.id,
    entidadeLabel: `${notinha.cliente.nome} — notinha ${numero(notinha.id)}`,
    acao: 'Pix conferido (parcial)',
    detalhes: `Crédito de R$ ${creditoPixPendente.toFixed(2)} confirmado`,
    clienteId: notinha.clienteId,
    operador,
  })

  await atualizarStatusSeCompleta(id, operador)

  return buscarPorId(id)
}
