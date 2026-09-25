import { prisma } from '../database/client.js'
import type { Prisma } from '../../generated/prisma/client.js'

const COM_RELACOES = { cliente: true, propriedade: true } as const

export function listar(where: Prisma.DebitoWhereInput) {
  return prisma.debito.findMany({ where, include: COM_RELACOES, orderBy: { criadoEm: 'desc' } })
}

export function buscarPorId(id: number) {
  return prisma.debito.findUnique({ where: { id }, include: COM_RELACOES })
}

export function criar(data: Prisma.DebitoCreateInput) {
  return prisma.debito.create({ data, include: COM_RELACOES })
}

export function atualizar(id: number, data: Prisma.DebitoUpdateInput) {
  return prisma.debito.update({ where: { id }, data, include: COM_RELACOES })
}
