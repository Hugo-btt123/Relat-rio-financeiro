import 'dotenv/config'
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import bcrypt from 'bcryptjs'
import cookieParser from 'cookie-parser'
import express from 'express'
import { app } from '../src/app.js'
import { prisma } from '../src/database/client.js'
import { exigirAdministrador, exigirLogin } from '../src/middlewares/auth.js'
import { errorHandler } from '../src/middlewares/errorHandler.js'

const SENHA_ADMIN = 'teste-admin-123'
const SENHA_FUNC = 'teste-func-123'

let server: Server
let baseUrl: string
let adminServer: Server
let adminBaseUrl: string

let loginAdmin: string
let loginFunc: string
let adminId: number
let funcId: number

function cookieDeSetCookie(setCookieHeader: string | null): string {
  assert.ok(setCookieHeader, 'esperava um header Set-Cookie na resposta')
  return setCookieHeader.split(';')[0]
}

before(async () => {
  const sufixo = Date.now().toString(36)
  loginAdmin = `teste-admin-${sufixo}`
  loginFunc = `teste-func-${sufixo}`

  const [adminHash, funcHash] = await Promise.all([bcrypt.hash(SENHA_ADMIN, 10), bcrypt.hash(SENHA_FUNC, 10)])

  const admin = await prisma.usuario.create({
    data: { nome: 'Admin Teste', login: loginAdmin, senha: adminHash, papel: 'administrador' },
  })
  const func = await prisma.usuario.create({
    data: { nome: 'Funcionário Teste', login: loginFunc, senha: funcHash, papel: 'funcionario' },
  })
  adminId = admin.id
  funcId = func.id

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve())
  })
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const adminOnlyApp = express()
  adminOnlyApp.use(cookieParser())
  adminOnlyApp.get('/admin-only', exigirLogin, exigirAdministrador, (_req, res) => {
    res.json({ ok: true })
  })
  adminOnlyApp.use(errorHandler)

  await new Promise<void>((resolve) => {
    adminServer = adminOnlyApp.listen(0, () => resolve())
  })
  adminBaseUrl = `http://127.0.0.1:${(adminServer.address() as AddressInfo).port}`
})

after(async () => {
  await prisma.usuario.deleteMany({ where: { id: { in: [adminId, funcId] } } })
  await Promise.all([
    new Promise<void>((resolve) => server.close(() => resolve())),
    new Promise<void>((resolve) => adminServer.close(() => resolve())),
  ])
  await prisma.$disconnect()
})

test('POST /auth/login com credenciais válidas devolve cookie httpOnly e dados do usuário (sem senha/token no corpo)', async () => {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: loginAdmin, senha: SENHA_ADMIN }),
  })
  assert.equal(res.status, 200)

  const setCookie = res.headers.get('set-cookie')
  assert.ok(setCookie)
  assert.match(setCookie, /token=/)
  assert.match(setCookie, /HttpOnly/i)

  const body = await res.json()
  assert.equal(body.papel, 'administrador')
  assert.equal(body.nome, 'Admin Teste')
  assert.equal(body.senha, undefined)
  assert.equal(body.token, undefined)
})

test('POST /auth/login com senha errada devolve 401', async () => {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: loginAdmin, senha: 'senha-errada' }),
  })
  assert.equal(res.status, 401)
})

test('GET /auth/me sem cookie devolve 401 (rota protegida por exigirLogin)', async () => {
  const res = await fetch(`${baseUrl}/auth/me`)
  assert.equal(res.status, 401)
})

test('fluxo completo: login -> GET /auth/me -> POST /auth/logout', async () => {
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: loginFunc, senha: SENHA_FUNC }),
  })
  assert.equal(loginRes.status, 200)
  const cookie = cookieDeSetCookie(loginRes.headers.get('set-cookie'))

  const meRes = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: cookie } })
  assert.equal(meRes.status, 200)
  const meBody = await meRes.json()
  assert.equal(meBody.id, funcId)
  assert.equal(meBody.papel, 'funcionario')

  const logoutRes = await fetch(`${baseUrl}/auth/logout`, { method: 'POST', headers: { Cookie: cookie } })
  assert.equal(logoutRes.status, 204)
})

test('exigirAdministrador: 401 sem cookie, 403 para funcionário, 200 para administrador', async () => {
  const semCookie = await fetch(`${adminBaseUrl}/admin-only`)
  assert.equal(semCookie.status, 401)

  const loginFuncRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: loginFunc, senha: SENHA_FUNC }),
  })
  const cookieFunc = cookieDeSetCookie(loginFuncRes.headers.get('set-cookie'))
  const comoFuncionario = await fetch(`${adminBaseUrl}/admin-only`, { headers: { Cookie: cookieFunc } })
  assert.equal(comoFuncionario.status, 403)

  const loginAdminRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: loginAdmin, senha: SENHA_ADMIN }),
  })
  const cookieAdmin = cookieDeSetCookie(loginAdminRes.headers.get('set-cookie'))
  const comoAdmin = await fetch(`${adminBaseUrl}/admin-only`, { headers: { Cookie: cookieAdmin } })
  assert.equal(comoAdmin.status, 200)
})
