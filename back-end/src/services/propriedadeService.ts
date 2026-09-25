import * as propriedadeRepository from '../repositories/propriedadeRepository.js'
import * as historicoService from './historicoService.js'
import { NotFoundError } from '../errors/NotFoundError.js'
import { ValidationError } from '../errors/ValidationError.js'
import type { Prisma } from '../../generated/prisma/client.js'

export async function listar(clienteId: number, apenasAtivas = true) {
  const where: Prisma.PropriedadeWhereInput = { clienteId }
  if (apenasAtivas) where.status = { not: 'inativo' }
  return propriedadeRepository.listar(where)
}

export interface CriarPropriedadeInput {
  nome?: string
  documento?: string
}

export async function criar(clienteId: number, input: CriarPropriedadeInput, operador?: string) {
  if (!input.nome || !input.nome.trim()) {
    throw new ValidationError('Informe um nome para a propriedade/filial.')
  }
  const propriedade = await propriedadeRepository.criar({
    nome: input.nome.trim(),
    documento: input.documento?.trim() ?? '',
    cliente: { connect: { id: clienteId } },
  })
  const { cliente, ...propriedadePublica } = propriedade
  await historicoService.registrar({
    entidade: 'Propriedade',
    entidadeId: propriedade.id,
    entidadeLabel: `${cliente.nome} — ${propriedade.nome}`,
    acao: 'Criada',
    clienteId,
    operador,
  })
  return propriedadePublica
}

export interface AtualizarPropriedadeInput {
  nome?: string
  documento?: string
  status?: string
}

export async function atualizar(id: number, input: AtualizarPropriedadeInput, operador?: string) {
  const existente = await propriedadeRepository.buscarPorId(id)
  if (!existente) throw new NotFoundError('Propriedade não encontrada.')
  if (input.nome !== undefined && !input.nome.trim()) {
    throw new ValidationError('O nome da propriedade não pode ficar vazio.')
  }

  const data: Prisma.PropriedadeUpdateInput = {}
  if (input.nome !== undefined) data.nome = input.nome.trim()
  if (input.documento !== undefined) data.documento = input.documento.trim()
  if (input.status !== undefined) data.status = input.status

  const propriedade = await propriedadeRepository.atualizar(id, data)
  const { cliente, ...propriedadePublica } = propriedade
  await historicoService.registrar({
    entidade: 'Propriedade',
    entidadeId: propriedade.id,
    entidadeLabel: `${cliente.nome} — ${propriedade.nome}`,
    acao: 'Editada',
    clienteId: propriedade.clienteId,
    operador,
  })
  return propriedadePublica
}
