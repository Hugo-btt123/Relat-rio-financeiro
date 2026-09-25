import * as notinhaRepository from '../repositories/notinhaRepository.js'
import * as debitoRepository from '../repositories/debitoRepository.js'
import * as clienteService from './clienteService.js'
import * as historicoService from './historicoService.js'
import { NotFoundError } from '../errors/NotFoundError.js'
import { ConflictError } from '../errors/ConflictError.js'
import { ValidationError } from '../errors/ValidationError.js'
import { arredondar } from '../utils/dinheiro.js'
import { competenciaValida } from '../utils/competencia.js'
import type { Prisma } from '../../generated/prisma/client.js'
import type { NotinhaComRelacoes } from '../dto/notinha/notinhaDto.js'

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
