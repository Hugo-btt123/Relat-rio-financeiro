import type { Cliente, Debito, Propriedade } from '../../../generated/prisma/client.js'

export type DebitoComRelacoes = Debito & { cliente: Cliente; propriedade: Propriedade | null }

export function paraDebitoPublico(debito: DebitoComRelacoes) {
  const { cliente, propriedade, valor, ...resto } = debito
  return {
    ...resto,
    valor: Number(valor),
    clienteNome: cliente.nome,
    propriedadeNome: propriedade ? propriedade.nome : null,
  }
}
