import * as notinhaRepository from '../repositories/notinhaRepository.js'
import * as historicoService from './historicoService.js'

function numero(notinhaId: number): string {
  return `#${String(notinhaId).padStart(3, '0')}`
}

// Se, após uma mudança, todos os itens não-cancelados de uma notinha estiverem
// "pago", a notinha inteira é marcada como "paga". Espelha
// atualizarStatusNotinhaSeCompleta em front-end/src/lib/db.js.
export async function atualizarStatusSeCompleta(notinhaId: number, operador?: string): Promise<void> {
  const notinha = await notinhaRepository.buscarPorId(notinhaId)
  if (!notinha) return

  const itens = await notinhaRepository.listarItens(notinhaId)
  const relevantes = itens.filter((d) => d.status !== 'cancelado')
  const todosPagos = relevantes.length > 0 && relevantes.every((d) => d.status === 'pago')

  if (todosPagos && notinha.status === 'ativa') {
    await notinhaRepository.atualizar(notinhaId, { status: 'paga' })
    await historicoService.registrar({
      entidade: 'Notinha',
      entidadeId: notinha.id,
      entidadeLabel: `${notinha.cliente.nome} — notinha ${numero(notinha.id)}`,
      acao: 'Quitada',
      clienteId: notinha.clienteId,
      operador,
    })
  }
}
