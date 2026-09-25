import { prisma } from '../database/client.js'
import { arredondar } from '../utils/dinheiro.js'
import { competenciaValida } from '../utils/competencia.js'
import { ValidationError } from '../errors/ValidationError.js'
import type { Debito } from '../../generated/prisma/client.js'

function soma(lista: Pick<Debito, 'valor'>[]): number {
  return arredondar(lista.reduce((s, d) => s + Number(d.valor), 0))
}

export async function obterMetricas(competencia: string) {
  if (!competencia || !competenciaValida(competencia)) {
    throw new ValidationError('Informe uma competência válida (MM/AAAA).')
  }

  const doMes = await prisma.debito.findMany({ where: { competencia } })
  const emAberto = doMes.filter((d) => d.status === 'aberto')
  const cobrados = doMes.filter((d) => d.status === 'cobrado' && !d.pixPendente)
  const pagos = doMes.filter((d) => d.status === 'pago')
  const cancelados = doMes.filter((d) => d.status === 'cancelado')
  const pixPendentes = doMes.filter((d) => d.pixPendente)

  const notinhasDoMes = await prisma.notinha.findMany({ where: { competencia } })
  const notinhasAtivas = notinhasDoMes.filter((n) => n.status === 'ativa')
  const notinhasPagas = notinhasDoMes.filter((n) => n.status === 'paga')

  const todosEmAberto = await prisma.debito.findMany({ where: { status: 'aberto' }, include: { cliente: true } })
  const somaPorCliente = new Map<number, { total: number; qtd: number; nome: string }>()
  for (const d of todosEmAberto) {
    const atual = somaPorCliente.get(d.clienteId) ?? { total: 0, qtd: 0, nome: d.cliente.nome }
    atual.total = arredondar(atual.total + Number(d.valor))
    atual.qtd += 1
    somaPorCliente.set(d.clienteId, atual)
  }
  const topInadimplentes = [...somaPorCliente.entries()]
    .map(([clienteId, v]) => ({ clienteId, nome: v.nome, total: v.total, qtd: v.qtd }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)

  return {
    emAberto: { total: soma(emAberto), qtd: emAberto.length },
    cobrado: { total: soma(cobrados), qtd: cobrados.length },
    pago: { total: soma(pagos), qtd: pagos.length },
    pixPendente: { total: soma(pixPendentes), qtd: pixPendentes.length },
    notinhasAtivas: notinhasAtivas.length,
    notinhasPagas: notinhasPagas.length,
    totalFaturado: arredondar(soma(emAberto) + soma(cobrados) + soma(pagos)),
    cancelado: { total: soma(cancelados), qtd: cancelados.length },
    topInadimplentes,
  }
}
