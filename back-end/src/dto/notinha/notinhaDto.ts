import type { Cliente, Notinha } from '../../../generated/prisma/client.js'
import { paraDebitoPublico, type DebitoComRelacoes } from '../debito/debitoDto.js'
import { arredondar } from '../../utils/dinheiro.js'

export type NotinhaComRelacoes = Notinha & { cliente: Cliente; debitos: DebitoComRelacoes[] }

// Calcula quanto já foi pago / está aguardando Pix / ainda em aberto, e o
// status "de exibição" (pix_a_conferir) de uma notinha. Função única —
// usada tanto para listar/buscar quanto (na Fase 7) dentro de qualquer
// transação de pagamento, nunca duplicada (CLAUDE.md §6).
export function paraNotinhaPublica(notinha: NotinhaComRelacoes) {
  const itens = notinha.debitos.map(paraDebitoPublico)

  const itensPagosSoma = itens.filter((i) => i.status === 'pago').reduce((s, i) => s + i.valor, 0)
  const itensPixPendenteSoma = itens.filter((i) => i.pixPendente).reduce((s, i) => s + i.valor, 0)

  const creditoAdiantado = Number(notinha.creditoAdiantado)
  const creditoPixPendente = Number(notinha.creditoPixPendente)
  const total = Number(notinha.total)

  const totalPago = arredondar(itensPagosSoma + creditoAdiantado)
  const totalPixPendente = arredondar(itensPixPendenteSoma + creditoPixPendente)
  const totalAberto = arredondar(total - totalPago - totalPixPendente)

  const relevantes = itens.filter((i) => i.status !== 'cancelado')
  let statusExibicao: string = notinha.status
  if (notinha.status === 'ativa' && relevantes.length > 0) {
    const nenhumEmAbertoDeVerdade = relevantes.every((i) => i.status === 'pago' || i.pixPendente)
    const temPixPendente = relevantes.some((i) => i.pixPendente) || creditoPixPendente > 0
    if (nenhumEmAbertoDeVerdade && temPixPendente) statusExibicao = 'pix_a_conferir'
  }

  const { cliente, debitos, ...resto } = notinha
  return {
    ...resto,
    total,
    creditoAdiantado,
    creditoPixPendente,
    numero: `#${String(notinha.id).padStart(3, '0')}`,
    clienteNome: cliente.nome,
    itens,
    totalPago,
    totalPixPendente,
    totalAberto,
    totalLiquido: totalAberto,
    statusExibicao,
  }
}
