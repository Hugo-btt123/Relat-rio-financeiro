import * as clienteRepository from '../repositories/clienteRepository.js'
import * as historicoService from './historicoService.js'
import { ValidationError } from '../errors/ValidationError.js'
import { NotFoundError } from '../errors/NotFoundError.js'
import { arredondar } from '../utils/dinheiro.js'
import type { Prisma } from '../../generated/prisma/client.js'

interface ListarClientesParams {
  busca?: string
  status?: string
}

export async function listar({ busca = '', status = 'todos' }: ListarClientesParams) {
  const where: Prisma.ClienteWhereInput = {}
  if (status !== 'todos') where.status = status
  const termo = busca.trim()
  if (termo) {
    where.OR = [
      { nome: { contains: termo, mode: 'insensitive' } },
      { cpf: { contains: termo, mode: 'insensitive' } },
    ]
  }
  const clientes = await clienteRepository.listar(where)
  return clientes.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export async function buscarPorNome(texto: string, limite = 8) {
  const termo = texto.trim()
  if (!termo) return []
  const clientes = await clienteRepository.listar({ nome: { contains: termo, mode: 'insensitive' } })
  return clientes.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).slice(0, limite)
}

export async function buscarPorId(id: number) {
  const cliente = await clienteRepository.buscarPorId(id)
  if (!cliente) throw new NotFoundError('Cliente não encontrado.')
  return cliente
}

export interface CriarClienteInput {
  nome: string
  cpf?: string
  telefone?: string
  observacoes?: string
  honorarioEscritorio?: number
}

export async function criar(input: CriarClienteInput, operador?: string) {
  if (!input.nome || !input.nome.trim()) {
    throw new ValidationError('O nome do cliente é obrigatório.')
  }
  const cliente = await clienteRepository.criar({
    nome: input.nome.trim(),
    cpf: input.cpf?.trim() ?? '',
    telefone: input.telefone?.trim() ?? '',
    observacoes: input.observacoes?.trim() ?? '',
    honorarioEscritorio: arredondar(input.honorarioEscritorio ?? 0),
  })
  await historicoService.registrar({
    entidade: 'Cliente',
    entidadeId: cliente.id,
    entidadeLabel: cliente.nome,
    acao: 'Criado',
    clienteId: cliente.id,
    operador,
  })
  return cliente
}

export interface AtualizarClienteInput {
  nome?: string
  cpf?: string
  telefone?: string
  observacoes?: string
  status?: string
  honorarioEscritorio?: number
}

export async function atualizar(id: number, input: AtualizarClienteInput, operador?: string) {
  await buscarPorId(id)

  const data: Prisma.ClienteUpdateInput = {}
  if (input.nome !== undefined) data.nome = input.nome.trim()
  if (input.cpf !== undefined) data.cpf = input.cpf.trim()
  if (input.telefone !== undefined) data.telefone = input.telefone.trim()
  if (input.observacoes !== undefined) data.observacoes = input.observacoes.trim()
  if (input.status !== undefined) data.status = input.status
  if (input.honorarioEscritorio !== undefined) data.honorarioEscritorio = arredondar(input.honorarioEscritorio)

  const cliente = await clienteRepository.atualizar(id, data)
  await historicoService.registrar({
    entidade: 'Cliente',
    entidadeId: cliente.id,
    entidadeLabel: cliente.nome,
    acao: 'Editado',
    clienteId: cliente.id,
    operador,
  })
  return cliente
}
