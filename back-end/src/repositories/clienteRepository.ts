import { prisma } from '../database/client.js'
import type { Prisma } from '../../generated/prisma/client.js'

export function listar(where: Prisma.ClienteWhereInput) {
  return prisma.cliente.findMany({ where })
}

export function buscarPorId(id: number) {
  return prisma.cliente.findUnique({ where: { id } })
}

export function criar(data: Prisma.ClienteCreateInput) {
  return prisma.cliente.create({ data })
}

export function atualizar(id: number, data: Prisma.ClienteUpdateInput) {
  return prisma.cliente.update({ where: { id }, data })
}
