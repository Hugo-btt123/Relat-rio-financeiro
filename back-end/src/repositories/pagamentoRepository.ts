import { prisma } from '../database/client.js'
import type { Prisma } from '../../generated/prisma/client.js'

export function criar(data: Prisma.PagamentoCreateInput) {
  return prisma.pagamento.create({ data })
}

export function listarPixPorNotinha(notinhaId: number) {
  return prisma.pagamento.findMany({ where: { notinhaId, pix: true } })
}
