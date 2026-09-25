import type { NextFunction, Request, Response } from 'express'
import { verificarToken } from '../services/authService.js'
import { UnauthorizedError } from '../errors/UnauthorizedError.js'
import { ForbiddenError } from '../errors/ForbiddenError.js'

export const COOKIE_NOME = 'token'

export function exigirLogin(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE_NOME]
  if (!token) {
    next(new UnauthorizedError('Autenticação necessária.'))
    return
  }
  try {
    req.usuario = verificarToken(token)
    next()
  } catch {
    next(new UnauthorizedError('Sessão inválida ou expirada.'))
  }
}

export function exigirAdministrador(req: Request, _res: Response, next: NextFunction): void {
  if (req.usuario?.papel !== 'administrador') {
    next(new ForbiddenError('Acesso restrito a administradores.'))
    return
  }
  next()
}
