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

export interface ListarHistoricoParams {
  entidade?: string
  operador?: string
}

export async function listar({ entidade = 'todas', operador = '' }: ListarHistoricoParams) {
  return historicoRepository.listar({
    ...(entidade !== 'todas' ? { entidade } : {}),
    ...(operador ? { operador: { contains: operador, mode: 'insensitive' } } : {}),
  })
}

export async function listarDaNotinha(notinhaId: number) {
  return historicoRepository.listarAsc({ entidade: 'Notinha', entidadeId: String(notinhaId) })
}

export async function listarDoCliente(clienteId: number) {
  return historicoRepository.listarAsc({ clienteId })
}
