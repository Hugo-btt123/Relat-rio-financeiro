import { prisma } from '../database/client.js'
import type { Prisma } from '../../generated/prisma/client.js'

const COM_RELACOES = {
  cliente: true,
  debitos: { include: { cliente: true, propriedade: true } },
} as const

export function listar(where: Prisma.NotinhaWhereInput) {
  return prisma.notinha.findMany({ where, include: COM_RELACOES, orderBy: { criadoEm: 'desc' } })
}

export function buscarPorId(id: number) {
  return prisma.notinha.findUnique({ where: { id }, include: COM_RELACOES })
}

export function listarItens(notinhaId: number) {
  return prisma.debito.findMany({ where: { notinhaId } })
}

export function criar(data: Prisma.NotinhaCreateInput) {
  return prisma.notinha.create({ data, include: COM_RELACOES })
}

export function atualizar(id: number, data: Prisma.NotinhaUpdateInput) {
  return prisma.notinha.update({ where: { id }, data, include: COM_RELACOES })
}
