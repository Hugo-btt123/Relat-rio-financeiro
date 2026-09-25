import * as historicoRepository from '../repositories/historicoRepository.js'

export interface RegistrarHistoricoInput {
  entidade: string
  entidadeId?: string | number | null
  entidadeLabel?: string | null
  acao: string
  detalhes?: string
  clienteId?: number | null
  operador?: string | null
}

export async function registrar(input: RegistrarHistoricoInput): Promise<void> {
  await historicoRepository.criar({
    entidade: input.entidade,
    entidadeId: input.entidadeId !== undefined && input.entidadeId !== null ? String(input.entidadeId) : null,
    entidadeLabel: input.entidadeLabel ?? null,
    acao: input.acao,
    detalhes: input.detalhes ?? '',
    operador: input.operador ?? 'Sistema',
    ...(input.clienteId ? { cliente: { connect: { id: input.clienteId } } } : {}),
  })
}
