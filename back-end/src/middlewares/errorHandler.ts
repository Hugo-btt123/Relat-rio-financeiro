import type { NextFunction, Request, Response } from 'express'
import { Prisma } from '../../generated/prisma/client.js'
import { AppError } from '../errors/AppError.js'
import type { ErrorResponseBody } from '../types/error.js'

const CODIGOS_PRISMA_400 = new Set(['P2000', 'P2006', 'P2007', 'P2011'])

export function errorHandler(err: unknown, _req: Request, res: Response<ErrorResponseBody>, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ erro: err.message })
    return
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ erro: 'Já existe um registro com esses dados.' })
      return
    }
    if (err.code === 'P2025') {
      res.status(404).json({ erro: 'Registro não encontrado.' })
      return
    }
    if (CODIGOS_PRISMA_400.has(err.code)) {
      res.status(400).json({ erro: 'Dados inválidos.' })
      return
    }
    console.error(err)
    res.status(500).json({ erro: 'Erro interno do servidor.' })
    return
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({ erro: 'Dados inválidos.' })
    return
  }

  if (typeof err === 'object' && err !== null && 'type' in err && (err as { type?: unknown }).type === 'entity.parse.failed') {
    res.status(400).json({ erro: 'Corpo da requisição inválido (JSON malformado).' })
    return
  }

  console.error(err)
  res.status(500).json({ erro: 'Erro interno do servidor.' })
}
