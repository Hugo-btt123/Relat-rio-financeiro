import type { NextFunction, Request, Response } from 'express'
import { verificarToken } from '../services/authService.js'
import { prisma } from '../database/client.js'
import { UnauthorizedError } from '../errors/UnauthorizedError.js'
import { ForbiddenError } from '../errors/ForbiddenError.js'

export const COOKIE_NOME = 'token'

export async function exigirLogin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[COOKIE_NOME]
  if (!token) {
    next(new UnauthorizedError('Autenticação necessária.'))
    return
  }
  try {
    const payload = verificarToken(token)
    const usuario = await prisma.usuario.findUnique({ where: { id: payload.id } })
    if (!usuario) {
      next(new UnauthorizedError('Sessão inválida ou expirada.'))
      return
    }
    req.usuario = { id: usuario.id, papel: usuario.papel, nome: usuario.nome }
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
