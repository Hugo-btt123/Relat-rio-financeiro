import { prisma } from '../database/client.js'
import type { Prisma } from '../../generated/prisma/client.js'

export function criar(data: Prisma.HistoricoCreateInput) {
  return prisma.historico.create({ data })
}

export function listar(where: Prisma.HistoricoWhereInput) {
  return prisma.historico.findMany({ where, orderBy: { quando: 'desc' } })
}

export function listarAsc(where: Prisma.HistoricoWhereInput) {
  return prisma.historico.findMany({ where, orderBy: { quando: 'asc' } })
}
