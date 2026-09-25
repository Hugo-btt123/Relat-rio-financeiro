import * as debitoRepository from '../repositories/debitoRepository.js'
import * as notinhaRepository from '../repositories/notinhaRepository.js'
import * as notinhaService from './notinhaService.js'
import * as historicoService from './historicoService.js'
import * as clienteService from './clienteService.js'
import { ValidationError } from '../errors/ValidationError.js'
import { NotFoundError } from '../errors/NotFoundError.js'
import { ConflictError } from '../errors/ConflictError.js'
import { arredondar } from '../utils/dinheiro.js'
import { competenciaValida } from '../utils/competencia.js'
import type { Prisma } from '../../generated/prisma/client.js'
import type { DebitoComRelacoes } from '../dto/debito/debitoDto.js'

const ROTULOS_STATUS_INTERNO: Record<string, string> = { aberto: 'Em aberto', cobrado: 'Cobrado', pago: 'Pago' }

function numeroNotinha(notinhaId: number): string {
  return `#${String(notinhaId).padStart(3, '0')}`
}

function validarDadosDebito({
  clienteId,
  descricao,
  valor,
  competencia,
}: {
  clienteId: number
  descricao: string
  valor: number
  competencia: string
}): void {
  if (!clienteId) throw new ValidationError('Selecione um cliente.')
  if (!descricao || !descricao.trim()) throw new ValidationError('Informe a descrição do débito.')
  if (!valor || Number(valor) <= 0) throw new ValidationError('Informe um valor maior que zero.')
  if (!competencia || !competencia.trim()) throw new ValidationError('Informe a competência.')
  if (!competenciaValida(competencia.trim())) {
    throw new ValidationError('Competência inválida — use o formato MM/AAAA (ex.: 04/2026).')
  }
}

async function localizarEditavel(id: number, statusPermitidos: string[]): Promise<DebitoComRelacoes> {
  const debito = await debitoRepository.buscarPorId(id)
  if (!debito) throw new NotFoundError('Débito não encontrado.')
  if (!statusPermitidos.includes(debito.status)) {
    throw new ConflictError(`Esta ação não é permitida para um débito "${debito.status}".`)
  }
  return debito
}

interface ListarDebitosParams {
  clienteId?: number | null
  status?: string
  competencia?: string
  busca?: string
  apenasPixPendente?: boolean
}

export async function listar({
  clienteId = null,
  status = 'todos',
  competencia = '',
  busca = '',
  apenasPixPendente = false,
}: ListarDebitosParams) {
  const where: Prisma.DebitoWhereInput = {}
  if (clienteId) where.clienteId = clienteId
  if (status !== 'todos') where.status = status as Prisma.EnumStatusDebitoFilter['equals']
  if (competencia) where.competencia = competencia
  if (apenasPixPendente) where.pixPendente = true
  const termo = busca.trim()
  if (termo) where.descricao = { contains: termo, mode: 'insensitive' }
  return debitoRepository.listar(where)
}

export interface CriarDebitoInput {
  clienteId: number
  propriedadeId?: number | null
  descricao: string
  valor: number
  competencia: string
  observacao?: string
}

export async function criar(input: CriarDebitoInput, operador?: string) {
  validarDadosDebito(input)
  await clienteService.buscarPorId(input.clienteId)

  const debito = await debitoRepository.criar({
    cliente: { connect: { id: input.clienteId } },
    propriedade: input.propriedadeId ? { connect: { id: input.propriedadeId } } : undefined,
    descricao: input.descricao.trim(),
    valor: arredondar(input.valor),
    competencia: input.competencia.trim(),
    observacao: input.observacao?.trim() ?? '',
    criadoPor: operador ?? 'Sistema',
  })

  await historicoService.registrar({
    entidade: 'Débito',
    entidadeId: debito.id,
    entidadeLabel: `${debito.cliente.nome} — ${debito.descricao}`,
    acao: 'Criado',
    detalhes: `Valor R$ ${Number(debito.valor).toFixed(2)} · competência ${debito.competencia}`,
    clienteId: input.clienteId,
    operador,
  })

  return debito
}

export interface LinhaDebitoEmGrupo {
  clienteId: number
  propriedadeId?: number | null
  valor: number
  observacao?: string
}

export interface CriarDebitosEmGrupoInput {
  descricao: string
  competencia: string
  linhas: LinhaDebitoEmGrupo[]
}

export async function criarEmGrupo(input: CriarDebitosEmGrupoInput, operador?: string) {
  if (!input.descricao || !input.descricao.trim()) throw new ValidationError('Informe a descrição do débito.')
  if (!input.competencia || !input.competencia.trim()) throw new ValidationError('Informe a competência.')
  if (!competenciaValida(input.competencia.trim())) {
    throw new ValidationError('Competência inválida — use o formato MM/AAAA (ex.: 04/2026).')
  }

  const validas = (input.linhas || []).filter((l) => l.clienteId && Number(l.valor) > 0)
  if (validas.length === 0) throw new ValidationError('Adicione ao menos um cliente com valor maior que zero.')

  const criados: DebitoComRelacoes[] = []
  for (const linha of validas) {
    const debito = await debitoRepository.criar({
      cliente: { connect: { id: linha.clienteId } },
      propriedade: linha.propriedadeId ? { connect: { id: linha.propriedadeId } } : undefined,
      descricao: input.descricao.trim(),
      valor: arredondar(linha.valor),
      competencia: input.competencia.trim(),
      observacao: (linha.observacao || '').trim(),
      criadoPor: operador ?? 'Sistema',
    })
    await historicoService.registrar({
      entidade: 'Débito',
      entidadeId: debito.id,
      entidadeLabel: `${debito.cliente.nome} — ${debito.descricao}`,
      acao: 'Criado (lançamento em grupo)',
      detalhes: `Valor R$ ${Number(debito.valor).toFixed(2)} · competência ${debito.competencia}`,
      clienteId: linha.clienteId,
      operador,
    })
    criados.push(debito)
  }
  return criados
}

export interface EditarDebitoInput {
  descricao?: string
  valor?: number
  competencia?: string
  observacao?: string
  propriedadeId?: number | null
}

export async function editar(id: number, input: EditarDebitoInput, operador?: string) {
  const debito = await localizarEditavel(id, ['aberto'])
  if (input.competencia !== undefined && input.competencia.trim() && !competenciaValida(input.competencia.trim())) {
    throw new ValidationError('Competência inválida — use o formato MM/AAAA (ex.: 04/2026).')
  }
  if (input.valor !== undefined && Number(input.valor) <= 0) {
    throw new ValidationError('Informe um valor maior que zero.')
  }

  const antes = `${debito.descricao} · R$ ${Number(debito.valor).toFixed(2)} · ${debito.competencia}`

  const data: Prisma.DebitoUpdateInput = {}
  if (input.descricao !== undefined) data.descricao = input.descricao.trim()
  if (input.valor !== undefined) data.valor = arredondar(input.valor)
  if (input.competencia !== undefined) data.competencia = input.competencia.trim()
  if (input.observacao !== undefined) data.observacao = input.observacao.trim()
  if (input.propriedadeId !== undefined) {
    data.propriedade = input.propriedadeId ? { connect: { id: input.propriedadeId } } : { disconnect: true }
  }

  const atualizado = await debitoRepository.atualizar(id, data)
  await historicoService.registrar({
    entidade: 'Débito',
    entidadeId: atualizado.id,
    entidadeLabel: `${atualizado.cliente.nome} — ${atualizado.descricao}`,
    acao: 'Editado',
    detalhes: `Antes: ${antes}`,
    clienteId: atualizado.clienteId,
    operador,
  })
  return atualizado
}

export async function cancelar(id: number, motivo = '', operador?: string) {
  const debito = await localizarEditavel(id, ['aberto', 'cobrado'])

  const atualizado = await debitoRepository.atualizar(id, { status: 'cancelado' })
  await historicoService.registrar({
    entidade: 'Débito',
    entidadeId: atualizado.id,
    entidadeLabel: `${atualizado.cliente.nome} — ${atualizado.descricao}`,
    acao: 'Cancelado',
    detalhes: motivo,
    clienteId: atualizado.clienteId,
    operador,
  })

  if (debito.notinhaId) {
    const notinha = await notinhaRepository.buscarPorId(debito.notinhaId)
    if (notinha) {
      const novoTotal = arredondar(Number(notinha.total) - Number(debito.valor))
      await notinhaRepository.atualizar(notinha.id, { total: novoTotal })
      await historicoService.registrar({
        entidade: 'Notinha',
        entidadeId: notinha.id,
        entidadeLabel: `${notinha.cliente.nome} — notinha ${numeroNotinha(notinha.id)}`,
        acao: 'Item cancelado',
        detalhes: `"${atualizado.descricao}" (R$ ${Number(atualizado.valor).toFixed(2)}) cancelado — total da notinha ajustado.`,
        clienteId: notinha.clienteId,
        operador,
      })
      await notinhaService.atualizarStatusSeCompleta(notinha.id, operador)
    }
  }

  return atualizado
}

export interface MarcarPagoDinheiroInput {
  formaPagamento?: string
  dataPagamento?: string
  obs?: string
}

export async function marcarPagoDinheiro(id: number, input: MarcarPagoDinheiroInput = {}, operador?: string) {
  await localizarEditavel(id, ['aberto'])

  const atualizado = await debitoRepository.atualizar(id, {
    status: 'pago',
    pixPendente: false,
    formaPagamento: input.formaPagamento ?? 'Dinheiro',
    dataPagamento: input.dataPagamento ? new Date(input.dataPagamento) : new Date(),
    obsPagamento: input.obs ?? '',
  })
  await historicoService.registrar({
    entidade: 'Débito',
    entidadeId: atualizado.id,
    entidadeLabel: `${atualizado.cliente.nome} — ${atualizado.descricao}`,
    acao: 'Pago',
    detalhes: `Forma: ${atualizado.formaPagamento}`,
    clienteId: atualizado.clienteId,
    operador,
  })
  return atualizado
}

export async function marcarPagoPix(id: number, obs = '', operador?: string) {
  await localizarEditavel(id, ['aberto'])

  const atualizado = await debitoRepository.atualizar(id, {
    status: 'cobrado',
    pixPendente: true,
    obsPagamento: obs,
  })
  await historicoService.registrar({
    entidade: 'Débito',
    entidadeId: atualizado.id,
    entidadeLabel: `${atualizado.cliente.nome} — ${atualizado.descricao}`,
    acao: 'Pix aguardando conferência',
    detalhes: obs,
    clienteId: atualizado.clienteId,
    operador,
  })
  return atualizado
}

async function notinhaTemItemPixPendente(notinhaId: number): Promise<boolean> {
  const itens = await notinhaRepository.listarItens(notinhaId)
  return itens.some((d) => d.pixPendente)
}

async function confirmarPixInterno(id: number, operador?: string) {
  const debito = await debitoRepository.buscarPorId(id)
  if (!debito) throw new NotFoundError('Débito não encontrado.')
  if (!debito.pixPendente) throw new ConflictError('Este débito não está aguardando conferência de Pix.')

  const atualizado = await debitoRepository.atualizar(id, {
    status: 'pago',
    pixPendente: false,
    formaPagamento: 'Pix',
    dataPagamento: new Date(),
  })
  await historicoService.registrar({
    entidade: 'Débito',
    entidadeId: atualizado.id,
    entidadeLabel: `${atualizado.cliente.nome} — ${atualizado.descricao}`,
    acao: 'Pix conferido',
    clienteId: atualizado.clienteId,
    operador,
  })

  if (atualizado.notinhaId) {
    const notinha = await notinhaRepository.buscarPorId(atualizado.notinhaId)
    if (notinha) {
      const aindaTemPixPendente = await notinhaTemItemPixPendente(notinha.id)
      if (!aindaTemPixPendente && Number(notinha.creditoPixPendente) > 0) {
        await notinhaRepository.atualizar(notinha.id, {
          creditoAdiantado: arredondar(Number(notinha.creditoAdiantado) + Number(notinha.creditoPixPendente)),
          creditoPixPendente: 0,
        })
      }
    }
    await notinhaService.atualizarStatusSeCompleta(atualizado.notinhaId, operador)
  }

  return atualizado
}

export async function confirmarPix(id: number, operador?: string) {
  return confirmarPixInterno(id, operador)
}

export async function confirmarPixEmLote(ids: number[], operador?: string) {
  const resultados: DebitoComRelacoes[] = []
  for (const id of ids) {
    resultados.push(await confirmarPixInterno(id, operador))
  }
  return resultados
}

export type StatusAlvo = 'aberto' | 'cobrado' | 'pago'

export interface AlterarStatusOpcoes {
  pix?: boolean
  obs?: string
  dataPagamento?: string
}

export async function alterarStatus(id: number, alvo: StatusAlvo, opcoes: AlterarStatusOpcoes = {}, operador?: string) {
  const debito = await debitoRepository.buscarPorId(id)
  if (!debito) throw new NotFoundError('Débito não encontrado.')
  if (debito.status === 'cancelado') throw new ConflictError('Um débito cancelado não pode ter o status alterado.')
  if (!['aberto', 'cobrado', 'pago'].includes(alvo)) throw new ValidationError('Status de destino inválido.')

  const notinha = debito.notinhaId ? await notinhaRepository.buscarPorId(debito.notinhaId) : null
  const rotuloAnterior = debito.status === 'cobrado' && debito.pixPendente ? 'Pix a conferir' : ROTULOS_STATUS_INTERNO[debito.status]
  const notinhaEstavaPaga = notinha?.status === 'paga'
  const ficaPagoAgora = alvo === 'pago' && !opcoes.pix

  const data: Prisma.DebitoUpdateInput = {}
  if (alvo === 'aberto') {
    data.status = 'aberto'
    data.notinha = { disconnect: true }
    data.competenciaNotinha = null
    data.pixPendente = false
    data.formaPagamento = null
    data.dataPagamento = null
    data.obsPagamento = opcoes.obs || null
  } else if (alvo === 'cobrado') {
    data.status = 'cobrado'
    data.pixPendente = !notinha && !!opcoes.pix
    data.formaPagamento = null
    data.dataPagamento = null
    if (opcoes.obs) data.obsPagamento = opcoes.obs
  } else if (ficaPagoAgora) {
    data.status = 'pago'
    data.pixPendente = false
    data.formaPagamento = 'Dinheiro'
    data.dataPagamento = opcoes.dataPagamento ? new Date(opcoes.dataPagamento) : new Date()
    if (opcoes.obs) data.obsPagamento = opcoes.obs
  } else {
    data.status = 'cobrado'
    data.pixPendente = true
    data.formaPagamento = null
    data.dataPagamento = null
    if (opcoes.obs) data.obsPagamento = opcoes.obs
  }

  const atualizado = await debitoRepository.atualizar(id, data)

  if (alvo === 'aberto' && notinha) {
    await notinhaRepository.atualizar(notinha.id, { total: arredondar(Number(notinha.total) - Number(debito.valor)) })
  }

  const rotuloNovo =
    (alvo === 'cobrado' && atualizado.pixPendente) || (alvo === 'pago' && !ficaPagoAgora)
      ? 'Pix a conferir'
      : ROTULOS_STATUS_INTERNO[ficaPagoAgora ? 'pago' : alvo === 'pago' ? 'cobrado' : alvo]

  await historicoService.registrar({
    entidade: 'Débito',
    entidadeId: atualizado.id,
    entidadeLabel: `${atualizado.cliente.nome} — ${atualizado.descricao}`,
    acao: 'Status corrigido manualmente',
    detalhes: `De "${rotuloAnterior}" para "${rotuloNovo}"${opcoes.obs ? ` · ${opcoes.obs}` : ''}`,
    clienteId: atualizado.clienteId,
    operador,
  })

  if (notinha) {
    await historicoService.registrar({
      entidade: 'Notinha',
      entidadeId: notinha.id,
      entidadeLabel: `${notinha.cliente.nome} — notinha ${numeroNotinha(notinha.id)}`,
      acao: 'Item alterado',
      detalhes: `"${atualizado.descricao}" (R$ ${Number(atualizado.valor).toFixed(2)}) alterado de "${rotuloAnterior}" para "${rotuloNovo}"${alvo === 'aberto' ? ' — removido da notinha' : ''}`,
      clienteId: notinha.clienteId,
      operador,
    })
    if (notinhaEstavaPaga && !ficaPagoAgora) {
      await notinhaRepository.atualizar(notinha.id, { status: 'ativa' })
      await historicoService.registrar({
        entidade: 'Notinha',
        entidadeId: notinha.id,
        entidadeLabel: `${notinha.cliente.nome} — notinha ${numeroNotinha(notinha.id)}`,
        acao: 'Reaberta automaticamente',
        detalhes: 'Um item deixou de estar pago.',
        clienteId: notinha.clienteId,
        operador,
      })
    }
    if (ficaPagoAgora) {
      await notinhaService.atualizarStatusSeCompleta(notinha.id, operador)
    }
  }

  return atualizado
}
