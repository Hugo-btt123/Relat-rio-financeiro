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
let adminId: number
let cookieAdmin: string
let clienteId: number

const clientesCriados: number[] = []
const debitosCriados: number[] = []
const notinhasCriadas: number[] = []

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

async function criarDebitoFixture(valor: number, descricao = 'Débito') {
  const res = await fetch(`${baseUrl}/debitos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ clienteId, descricao, valor, competencia: '05/2026' }),
  })
  assert.equal(res.status, 201)
  const debito = await res.json()
  debitosCriados.push(debito.id)
  return debito
}

before(async () => {
  const sufixo = Date.now().toString(36)
  loginAdmin = `teste-not-admin-${sufixo}`
  const adminHash = await bcrypt.hash('senha-admin', 10)
  const admin = await prisma.usuario.create({
    data: { nome: 'Admin Teste Notinhas', login: loginAdmin, senha: adminHash, papel: 'administrador' },
  })
  adminId = admin.id

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve())
  })
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  cookieAdmin = await login(loginAdmin, 'senha-admin')

  const clienteRes = await fetch(`${baseUrl}/clientes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ nome: 'Cliente Teste Notinhas' }),
  })
  const cliente = await clienteRes.json()
  clienteId = cliente.id
  clientesCriados.push(clienteId)
})

after(async () => {
  if (notinhasCriadas.length > 0) {
    await prisma.debito.updateMany({ where: { notinhaId: { in: notinhasCriadas } }, data: { notinhaId: null } })
    await prisma.notinha.deleteMany({ where: { id: { in: notinhasCriadas } } })
  }
  if (debitosCriados.length > 0) {
    await prisma.debito.deleteMany({ where: { id: { in: debitosCriados } } })
  }
  if (clientesCriados.length > 0) {
    await prisma.cliente.deleteMany({ where: { id: { in: clientesCriados } } })
  }
  await prisma.usuario.deleteMany({ where: { id: adminId } })
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await prisma.$disconnect()
})

test('POST /notinhas cria a partir de débitos em aberto; GET /notinhas/:id devolve itens e totais', async () => {
  const d1 = await criarDebitoFixture(300, 'FGTS')
  const d2 = await criarDebitoFixture(200, 'INSS')

  const criarRes = await fetch(`${baseUrl}/notinhas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ clienteId, competencia: '05/2026', debitoIds: [d1.id, d2.id] }),
  })
  assert.equal(criarRes.status, 201)
  const notinha = await criarRes.json()
  notinhasCriadas.push(notinha.id)
  assert.equal(notinha.status, 'ativa')
  assert.equal(notinha.total, 500)
  assert.equal(notinha.numero, `#${String(notinha.id).padStart(3, '0')}`)
  assert.equal(notinha.itens.length, 2)
  assert.equal(notinha.totalPago, 0)
  assert.equal(notinha.totalAberto, 500)

  const d1Depois = await fetch(`${baseUrl}/debitos?clienteId=${clienteId}`, { headers: { Cookie: cookieAdmin } })
  const debitos = await d1Depois.json()
  const d1Atualizado = debitos.find((d: { id: number }) => d.id === d1.id)
  assert.equal(d1Atualizado.status, 'cobrado')
  assert.equal(d1Atualizado.notinhaId, notinha.id)

  const buscarRes = await fetch(`${baseUrl}/notinhas/${notinha.id}`, { headers: { Cookie: cookieAdmin } })
  assert.equal(buscarRes.status, 200)
  const encontrada = await buscarRes.json()
  assert.equal(encontrada.itens.length, 2)
})

test('POST /notinhas rejeita débito que já está cobrado por outra notinha (409)', async () => {
  const d1 = await criarDebitoFixture(100, 'Já cobrado')
  const criarRes = await fetch(`${baseUrl}/notinhas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ clienteId, competencia: '05/2026', debitoIds: [d1.id] }),
  })
  assert.equal(criarRes.status, 201)
  const notinha = await criarRes.json()
  notinhasCriadas.push(notinha.id)

  const outraNotinhaRes = await fetch(`${baseUrl}/notinhas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ clienteId, competencia: '05/2026', debitoIds: [d1.id] }),
  })
  assert.equal(outraNotinhaRes.status, 409)
})

test('PATCH /notinhas/:id edita competência e propaga para os débitos vinculados', async () => {
  const d1 = await criarDebitoFixture(150, 'Editável')
  const criarRes = await fetch(`${baseUrl}/notinhas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ clienteId, competencia: '05/2026', debitoIds: [d1.id] }),
  })
  const notinha = await criarRes.json()
  notinhasCriadas.push(notinha.id)

  const editarRes = await fetch(`${baseUrl}/notinhas/${notinha.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ competencia: '06/2026', observacoes: 'nota editada' }),
  })
  assert.equal(editarRes.status, 200)
  const editada = await editarRes.json()
  assert.equal(editada.competencia, '06/2026')
  assert.equal(editada.observacoes, 'nota editada')

  const debitoAtualizado = await prisma.debito.findUnique({ where: { id: d1.id } })
  assert.equal(debitoAtualizado?.competenciaNotinha, '06/2026')
})

test('POST /notinhas/:id/adicionar-debitos aumenta o total; falha para notinha não ativa', async () => {
  const d1 = await criarDebitoFixture(100, 'Inicial')
  const criarRes = await fetch(`${baseUrl}/notinhas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ clienteId, competencia: '05/2026', debitoIds: [d1.id] }),
  })
  const notinha = await criarRes.json()
  notinhasCriadas.push(notinha.id)

  const d2 = await criarDebitoFixture(250, 'Adicionado depois')
  const adicionarRes = await fetch(`${baseUrl}/notinhas/${notinha.id}/adicionar-debitos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ debitoIds: [d2.id] }),
  })
  assert.equal(adicionarRes.status, 200)
  const atualizada = await adicionarRes.json()
  assert.equal(atualizada.total, 350)
  assert.equal(atualizada.itens.length, 2)

  await prisma.notinha.update({ where: { id: notinha.id }, data: { status: 'estornada' } })
  const d3 = await criarDebitoFixture(50, 'Não deveria entrar')
  const adicionarEmEstornadaRes = await fetch(`${baseUrl}/notinhas/${notinha.id}/adicionar-debitos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ debitoIds: [d3.id] }),
  })
  assert.equal(adicionarEmEstornadaRes.status, 409)
})

test('POST /notinhas/:id/estornar solta os débitos (voltam a "aberto") e some da lista de itens (bug #2)', async () => {
  const d1 = await criarDebitoFixture(400, 'Vai estornar')
  const criarRes = await fetch(`${baseUrl}/notinhas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ clienteId, competencia: '05/2026', debitoIds: [d1.id] }),
  })
  const notinha = await criarRes.json()
  notinhasCriadas.push(notinha.id)

  const estornarRes = await fetch(`${baseUrl}/notinhas/${notinha.id}/estornar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ motivo: 'erro de lançamento' }),
  })
  assert.equal(estornarRes.status, 200)
  const estornada = await estornarRes.json()
  assert.equal(estornada.status, 'estornada')
  assert.equal(estornada.itens.length, 0, 'itens precisam sumir da lista da notinha estornada, não só soltar o vínculo')

  const debitoDepois = await prisma.debito.findUnique({ where: { id: d1.id } })
  assert.equal(debitoDepois?.status, 'aberto')
  assert.equal(debitoDepois?.notinhaId, null)

  const estornarDeNovoRes = await fetch(`${baseUrl}/notinhas/${notinha.id}/estornar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({}),
  })
  assert.equal(estornarDeNovoRes.status, 409)
})

test('POST /notinhas/:id/reabrir só funciona para notinha paga; mantém o vínculo dos débitos', async () => {
  const d1 = await criarDebitoFixture(220, 'Vai pagar e reabrir')
  const criarRes = await fetch(`${baseUrl}/notinhas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ clienteId, competencia: '05/2026', debitoIds: [d1.id] }),
  })
  const notinha = await criarRes.json()
  notinhasCriadas.push(notinha.id)

  const reabrirAtivaRes = await fetch(`${baseUrl}/notinhas/${notinha.id}/reabrir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({}),
  })
  assert.equal(reabrirAtivaRes.status, 409, 'não pode reabrir notinha que não está paga')

  await fetch(`${baseUrl}/debitos/${d1.id}/alterar-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ alvo: 'pago', pix: false }),
  })
  const notinhaPaga = await prisma.notinha.findUnique({ where: { id: notinha.id } })
  assert.equal(notinhaPaga?.status, 'paga')

  const reabrirRes = await fetch(`${baseUrl}/notinhas/${notinha.id}/reabrir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ motivo: 'pago sem querer' }),
  })
  assert.equal(reabrirRes.status, 200)
  const reaberta = await reabrirRes.json()
  assert.equal(reaberta.status, 'ativa')
  assert.equal(reaberta.itens.length, 1, 'débito continua vinculado, diferente de estornar')
  assert.equal(reaberta.itens[0].status, 'cobrado')
})
