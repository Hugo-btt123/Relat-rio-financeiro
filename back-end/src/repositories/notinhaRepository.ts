import { prisma } from '../database/client.js'
import type { Prisma } from '../../generated/prisma/client.js'

export function buscarPorId(id: number) {
  return prisma.notinha.findUnique({ where: { id }, include: { cliente: true } })
}

export function listarItens(notinhaId: number) {
  return prisma.debito.findMany({ where: { notinhaId } })
}

export function atualizar(id: number, data: Prisma.NotinhaUpdateInput) {
  return prisma.notinha.update({ where: { id }, data, include: { cliente: true } })
}
