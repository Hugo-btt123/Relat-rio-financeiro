import 'dotenv/config'
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import bcrypt from 'bcryptjs'
import { app } from '../src/app.js'
import { prisma } from '../src/database/client.js'

let server: Server
let baseUrl: string

let loginAdmin: string
let loginFunc: string
let adminId: number
let funcId: number
let cookieAdmin: string
let cookieFunc: string

const clientesCriadosNoTeste: number[] = []

function cookieDeSetCookie(setCookieHeader: string | null): string {
  assert.ok(setCookieHeader, 'esperava um header Set-Cookie na resposta')
  return setCookieHeader.split(';')[0]
}

async function login(loginValor: string, senha: string): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: loginValor, senha }),
  })
  assert.equal(res.status, 200)
  return cookieDeSetCookie(res.headers.get('set-cookie'))
}

before(async () => {
  const sufixo = Date.now().toString(36)
  loginAdmin = `teste-cli-admin-${sufixo}`
  loginFunc = `teste-cli-func-${sufixo}`

  const [adminHash, funcHash] = await Promise.all([bcrypt.hash('senha-admin', 10), bcrypt.hash('senha-func', 10)])

  const admin = await prisma.usuario.create({
    data: { nome: 'Admin Teste Clientes', login: loginAdmin, senha: adminHash, papel: 'administrador' },
  })
  const func = await prisma.usuario.create({
    data: { nome: 'Funcionário Teste Clientes', login: loginFunc, senha: funcHash, papel: 'funcionario' },
  })
  adminId = admin.id
  funcId = func.id

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve())
  })
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  cookieAdmin = await login(loginAdmin, 'senha-admin')
  cookieFunc = await login(loginFunc, 'senha-func')
})

after(async () => {
  if (clientesCriadosNoTeste.length > 0) {
    await prisma.propriedade.deleteMany({ where: { clienteId: { in: clientesCriadosNoTeste } } })
    await prisma.cliente.deleteMany({ where: { id: { in: clientesCriadosNoTeste } } })
  }
  await prisma.usuario.deleteMany({ where: { id: { in: [adminId, funcId] } } })
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await prisma.$disconnect()
})

test('POST /clientes cria cliente (admin, com honorarioEscritorio) e GET /clientes/:id retorna', async () => {
  const criarRes = await fetch(`${baseUrl}/clientes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ nome: 'Cliente Teste Ltda', cpf: '123.456.789-00', honorarioEscritorio: 150.5 }),
  })
  assert.equal(criarRes.status, 201)
  const criado = await criarRes.json()
  assert.equal(criado.nome, 'Cliente Teste Ltda')
  assert.equal(criado.honorarioEscritorio, 150.5)
  clientesCriadosNoTeste.push(criado.id)

  const buscarRes = await fetch(`${baseUrl}/clientes/${criado.id}`, { headers: { Cookie: cookieAdmin } })
  assert.equal(buscarRes.status, 200)
  const encontrado = await buscarRes.json()
  assert.equal(encontrado.id, criado.id)
  assert.equal(encontrado.honorarioEscritorio, 150.5)
})

test('POST /clientes sem nome devolve 400', async () => {
  const res = await fetch(`${baseUrl}/clientes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ nome: '' }),
  })
  assert.equal(res.status, 400)
})

test('GET /clientes lista e PATCH /clientes/:id atualiza', async () => {
  const criarRes = await fetch(`${baseUrl}/clientes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ nome: 'Cliente Para Atualizar' }),
  })
  const criado = await criarRes.json()
  clientesCriadosNoTeste.push(criado.id)

  const listarRes = await fetch(`${baseUrl}/clientes?busca=Cliente Para Atualizar`, { headers: { Cookie: cookieAdmin } })
  assert.equal(listarRes.status, 200)
  const lista = await listarRes.json()
  assert.ok(lista.some((c: { id: number }) => c.id === criado.id))

  const atualizarRes = await fetch(`${baseUrl}/clientes/${criado.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ telefone: '(35) 90000-0000', status: 'inativo' }),
  })
  assert.equal(atualizarRes.status, 200)
  const atualizado = await atualizarRes.json()
  assert.equal(atualizado.telefone, '(35) 90000-0000')
  assert.equal(atualizado.status, 'inativo')
})

test('honorarioEscritorio some da resposta para funcionário e não pode ser definido por ele', async () => {
  const criarRes = await fetch(`${baseUrl}/clientes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ nome: 'Cliente Honorario', honorarioEscritorio: 300 }),
  })
  const criado = await criarRes.json()
  clientesCriadosNoTeste.push(criado.id)
  assert.equal(criado.honorarioEscritorio, 300)

  const comoFuncionario = await fetch(`${baseUrl}/clientes/${criado.id}`, { headers: { Cookie: cookieFunc } })
  assert.equal(comoFuncionario.status, 200)
  const corpoFuncionario = await comoFuncionario.json()
  assert.equal('honorarioEscritorio' in corpoFuncionario, false)

  const listaFuncionario = await fetch(`${baseUrl}/clientes`, { headers: { Cookie: cookieFunc } })
  const arrayFuncionario = await listaFuncionario.json()
  for (const c of arrayFuncionario) {
    assert.equal('honorarioEscritorio' in c, false)
  }

  const tentativaFuncionarioCriar = await fetch(`${baseUrl}/clientes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieFunc },
    body: JSON.stringify({ nome: 'Cliente Criado Por Funcionario', honorarioEscritorio: 999 }),
  })
  assert.equal(tentativaFuncionarioCriar.status, 201)
  const criadoPorFuncionario = await tentativaFuncionarioCriar.json()
  clientesCriadosNoTeste.push(criadoPorFuncionario.id)
  assert.equal('honorarioEscritorio' in criadoPorFuncionario, false)

  const conferirComoAdmin = await fetch(`${baseUrl}/clientes/${criadoPorFuncionario.id}`, { headers: { Cookie: cookieAdmin } })
  const corpoAdmin = await conferirComoAdmin.json()
  assert.equal(corpoAdmin.honorarioEscritorio, 0)
})

test('propriedades: criar e listar vinculadas a um cliente', async () => {
  const criarClienteRes = await fetch(`${baseUrl}/clientes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ nome: 'Cliente Com Propriedade' }),
  })
  const cliente = await criarClienteRes.json()
  clientesCriadosNoTeste.push(cliente.id)

  const criarPropRes = await fetch(`${baseUrl}/clientes/${cliente.id}/propriedades`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ nome: 'Filial Centro', documento: '12.345.678/0001-99' }),
  })
  assert.equal(criarPropRes.status, 201)
  const propriedade = await criarPropRes.json()

  const listarRes = await fetch(`${baseUrl}/clientes/${cliente.id}/propriedades`, { headers: { Cookie: cookieAdmin } })
  const propriedades = await listarRes.json()
  assert.equal(propriedades.length, 1)
  assert.equal(propriedades[0].id, propriedade.id)

  const atualizarRes = await fetch(`${baseUrl}/propriedades/${propriedade.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ status: 'inativo' }),
  })
  assert.equal(atualizarRes.status, 200)

  const listarAtivasRes = await fetch(`${baseUrl}/clientes/${cliente.id}/propriedades`, { headers: { Cookie: cookieAdmin } })
  const ativas = await listarAtivasRes.json()
  assert.equal(ativas.length, 0)

  const listarTodasRes = await fetch(`${baseUrl}/clientes/${cliente.id}/propriedades?apenasAtivas=false`, { headers: { Cookie: cookieAdmin } })
  const todas = await listarTodasRes.json()
  assert.equal(todas.length, 1)
})
