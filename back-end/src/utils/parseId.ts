import { ValidationError } from '../errors/ValidationError.js'

export function parseId(valor: string | string[] | undefined): number {
  const id = Number(Array.isArray(valor) ? valor[0] : valor)
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('Identificador inválido.')
  }
  return id
}
