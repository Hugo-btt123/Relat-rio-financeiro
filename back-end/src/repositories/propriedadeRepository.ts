import { prisma } from '../database/client.js'
import type { Prisma } from '../../generated/prisma/client.js'

export function listar(where: Prisma.PropriedadeWhereInput) {
  return prisma.propriedade.findMany({ where, orderBy: { criadoEm: 'asc' } })
}

export function buscarPorId(id: number) {
  return prisma.propriedade.findUnique({ where: { id } })
}

export function criar(data: Prisma.PropriedadeCreateInput) {
  return prisma.propriedade.create({ data })
}

export function atualizar(id: number, data: Prisma.PropriedadeUpdateInput) {
  return prisma.propriedade.update({ where: { id }, data })
}
