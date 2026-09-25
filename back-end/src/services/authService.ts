import 'dotenv/config'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../database/client.js'
import { UnauthorizedError } from '../errors/UnauthorizedError.js'

const JWT_EXPIRES_IN = '8h'

export interface TokenPayload {
  id: number
  papel: 'administrador' | 'funcionario'
}

function segredo(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET não definida no ambiente.')
  return secret
}

export async function autenticar(login: string, senha: string) {
  const usuario = await prisma.usuario.findUnique({ where: { login } })
  if (!usuario) throw new UnauthorizedError('Login ou senha inválidos.')

  const senhaOk = await bcrypt.compare(senha, usuario.senha)
  if (!senhaOk) throw new UnauthorizedError('Login ou senha inválidos.')

  const token = jwt.sign({ id: usuario.id, papel: usuario.papel } satisfies TokenPayload, segredo(), {
    expiresIn: JWT_EXPIRES_IN,
  })

  return { token, usuario }
}

export function verificarToken(token: string): TokenPayload {
  return jwt.verify(token, segredo()) as TokenPayload
}
