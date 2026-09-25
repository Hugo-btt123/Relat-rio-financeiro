import type { Request, Response } from 'express'
import * as authService from '../services/authService.js'
import { prisma } from '../database/client.js'
import { ValidationError } from '../errors/ValidationError.js'
import { UnauthorizedError } from '../errors/UnauthorizedError.js'
import { COOKIE_NOME } from '../middlewares/auth.js'

function opcoesCookie() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000,
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const { login: loginBody, senha } = (req.body ?? {}) as { login?: unknown; senha?: unknown }
  if (!loginBody || !senha) {
    throw new ValidationError('Informe login e senha.')
  }

  const { token, usuario } = await authService.autenticar(String(loginBody), String(senha))

  res.cookie(COOKIE_NOME, token, opcoesCookie())
  res.json({ id: usuario.id, nome: usuario.nome, papel: usuario.papel })
}

export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie(COOKIE_NOME, opcoesCookie())
  res.status(204).send()
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.usuario) {
    throw new UnauthorizedError('Autenticação necessária.')
  }
  const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } })
  if (!usuario) {
    throw new UnauthorizedError('Autenticação necessária.')
  }
  res.json({ id: usuario.id, nome: usuario.nome, papel: usuario.papel })
}
