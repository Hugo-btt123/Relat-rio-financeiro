import type { Cliente } from '../../../generated/prisma/client.js'

export type Papel = 'administrador' | 'funcionario'

export function paraClientePublico(cliente: Cliente, papel: Papel) {
  const { honorarioEscritorio, ...resto } = cliente
  if (papel !== 'administrador') return resto
  return { ...resto, honorarioEscritorio: Number(honorarioEscritorio) }
}
