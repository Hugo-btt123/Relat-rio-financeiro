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
let clienteId: number

const COMPETENCIA = '07/2026'
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

async function criarDebito(valor: number, descricao = 'Débito', competencia = COMPETENCIA) {
  const res = await fetch(`${baseUrl}/debitos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ clienteId, descricao, valor, competencia }),
  })
  assert.equal(res.status, 201)
  const debito = await res.json()
  debitosCriados.push(debito.id)
  return debito
}

before(async () => {
  const sufixo = Date.now().toString(36)
  loginAdmin = `teste-adm-admin-${sufixo}`
  loginFunc = `teste-adm-func-${sufixo}`
  const [adminHash, funcHash] = await Promise.all([bcrypt.hash('senha-admin', 10), bcrypt.hash('senha-func', 10)])
  const admin = await prisma.usuario.create({
    data: { nome: 'Admin Teste Administração', login: loginAdmin, senha: adminHash, papel: 'administrador' },
  })
  const func = await prisma.usuario.create({
    data: { nome: 'Funcionário Teste Administração', login: loginFunc, senha: funcHash, papel: 'funcionario' },
  })
  adminId = admin.id
  funcId = func.id

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve())
  })
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  cookieAdmin = await login(loginAdmin, 'senha-admin')
  cookieFunc = await login(loginFunc, 'senha-func')

  const clienteRes = await fetch(`${baseUrl}/clientes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ nome: 'Cliente Teste Administração', honorarioEscritorio: 50 }),
  })
  const cliente = await clienteRes.json()
  clienteId = cliente.id
  clientesCriados.push(clienteId)
})

after(async () => {
  if (notinhasCriadas.length > 0) {
    await prisma.pagamento.deleteMany({ where: { notinhaId: { in: notinhasCriadas } } })
    await prisma.debito.updateMany({ where: { notinhaId: { in: notinhasCriadas } }, data: { notinhaId: null } })
    await prisma.notinha.deleteMany({ where: { id: { in: notinhasCriadas } } })
  }
  if (debitosCriados.length > 0) {
    await prisma.debito.deleteMany({ where: { id: { in: debitosCriados } } })
  }
  if (clientesCriados.length > 0) {
    await prisma.cliente.deleteMany({ where: { id: { in: clientesCriados } } })
  }
  await prisma.usuario.deleteMany({ where: { id: { in: [adminId, funcId] } } })
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await prisma.$disconnect()
})

test('GET /dashboard: 200 com o formato esperado para admin; 403 para funcionário', async () => {
  await criarDebito(300, 'Em aberto')
  const pago = await criarDebito(100, 'Vai pagar')
  await fetch(`${baseUrl}/debitos/${pago.id}/alterar-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ alvo: 'cobrado' }),
  })
  await fetch(`${baseUrl}/debitos/${pago.id}/alterar-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ alvo: 'pago', pix: false }),
  })

  const res = await fetch(`${baseUrl}/dashboard?competencia=${encodeURIComponent(COMPETENCIA)}`, {
    headers: { Cookie: cookieAdmin },
  })
  assert.equal(res.status, 200)
  const metricas = await res.json()
  assert.ok('emAberto' in metricas && 'total' in metricas.emAberto && 'qtd' in metricas.emAberto)
  assert.ok('cobrado' in metricas)
  assert.ok('pago' in metricas)
  assert.ok('pixPendente' in metricas)
  assert.ok('notinhasAtivas' in metricas)
  assert.ok('notinhasPagas' in metricas)
  assert.ok('totalFaturado' in metricas)
  assert.ok(Array.isArray(metricas.topInadimplentes))
  assert.ok(metricas.emAberto.total >= 300)
  assert.ok(metricas.pago.total >= 100)

  const funcRes = await fetch(`${baseUrl}/dashboard?competencia=${encodeURIComponent(COMPETENCIA)}`, {
    headers: { Cookie: cookieFunc },
  })
  assert.equal(funcRes.status, 403)
})

test('GET /historico: 200 para admin, 403 para funcionário', async () => {
  const res = await fetch(`${baseUrl}/historico`, { headers: { Cookie: cookieAdmin } })
  assert.equal(res.status, 200)
  const historico = await res.json()
  assert.ok(Array.isArray(historico))
  assert.ok(historico.length > 0)

  const funcRes = await fetch(`${baseUrl}/historico`, { headers: { Cookie: cookieFunc } })
  assert.equal(funcRes.status, 403)
})

test('GET /clientes/:id/historico e GET /notinhas/:id/historico: 200 para os dois papéis', async () => {
  const debito = await criarDebito(150, 'Para notinha do histórico')
  const notinhaRes = await fetch(`${baseUrl}/notinhas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ clienteId, competencia: COMPETENCIA, debitoIds: [debito.id] }),
  })
  const notinha = await notinhaRes.json()
  notinhasCriadas.push(notinha.id)

  const historicoClienteRes = await fetch(`${baseUrl}/clientes/${clienteId}/historico`, { headers: { Cookie: cookieFunc } })
  assert.equal(historicoClienteRes.status, 200)
  const historicoCliente = await historicoClienteRes.json()
  assert.ok(Array.isArray(historicoCliente))
  assert.ok(historicoCliente.some((h: { entidade: string }) => h.entidade === 'Cliente'))

  const historicoNotinhaRes = await fetch(`${baseUrl}/notinhas/${notinha.id}/historico`, { headers: { Cookie: cookieAdmin } })
  assert.equal(historicoNotinhaRes.status, 200)
  const historicoNotinha = await historicoNotinhaRes.json()
  assert.ok(Array.isArray(historicoNotinha))
  assert.ok(historicoNotinha.some((h: { acao: string }) => h.acao === 'Gerada'))
})

test('GET /pix-pendentes: 403 para funcionário (admin-only)', async () => {
  const res = await fetch(`${baseUrl}/pix-pendentes`, { headers: { Cookie: cookieFunc } })
  assert.equal(res.status, 403)
})

test('GET /busca: 200 com clientes/debitos/notinhas; honorarioEscritorio some para funcionário', async () => {
  const res = await fetch(`${baseUrl}/busca?texto=Administração`, { headers: { Cookie: cookieAdmin } })
  assert.equal(res.status, 200)
  const resultado = await res.json()
  assert.ok(Array.isArray(resultado.clientes))
  assert.ok(Array.isArray(resultado.debitos))
  assert.ok(Array.isArray(resultado.notinhas))
  assert.ok(resultado.clientes.some((c: { id: number }) => c.id === clienteId))
  const clienteAdmin = resultado.clientes.find((c: { id: number }) => c.id === clienteId)
  assert.equal(clienteAdmin.honorarioEscritorio, 50)

  const resFunc = await fetch(`${baseUrl}/busca?texto=Administração`, { headers: { Cookie: cookieFunc } })
  const resultadoFunc = await resFunc.json()
  const clienteFunc = resultadoFunc.clientes.find((c: { id: number }) => c.id === clienteId)
  assert.equal('honorarioEscritorio' in clienteFunc, false)
})

test('GET /backup/exportar-detalhado: 200 com o formato esperado', async () => {
  const res = await fetch(`${baseUrl}/backup/exportar-detalhado`, { headers: { Cookie: cookieAdmin } })
  assert.equal(res.status, 200)
  const dados = await res.json()
  assert.ok(Array.isArray(dados.clientes))
  assert.ok(Array.isArray(dados.propriedades))
  assert.ok(Array.isArray(dados.debitos))
  assert.ok(Array.isArray(dados.notinhas))
  assert.ok(Array.isArray(dados.notinhaItens))
  assert.ok(Array.isArray(dados.historico))
  assert.ok(dados.notinhas.every((n: { itens?: unknown; quantidadeItens: number }) => n.itens === undefined && typeof n.quantidadeItens === 'number'))
})

test('GET /backup/exportar: 200 com tipo/versao corretos; honorarioEscritorio some para funcionário', async () => {
  const res = await fetch(`${baseUrl}/backup/exportar`, { headers: { Cookie: cookieAdmin } })
  assert.equal(res.status, 200)
  const backup = await res.json()
  assert.equal(backup.tipo, 'crediario-digital-backup')
  assert.equal(backup.versao, 1)
  assert.ok(Array.isArray(backup.clientes))
  assert.ok(Array.isArray(backup.debitos))
  assert.ok(Array.isArray(backup.notinhas))
  assert.ok(Array.isArray(backup.pagamentos))

  const resFunc = await fetch(`${baseUrl}/backup/exportar`, { headers: { Cookie: cookieFunc } })
  const backupFunc = await resFunc.json()
  const algumCliente = backupFunc.clientes[0]
  assert.equal('honorarioEscritorio' in algumCliente, false)
})

test('POST /backup/restaurar: 403 para funcionário; rejeita arquivo inválido; admin consegue restaurar (round-trip)', async () => {
  const semPermissaoRes = await fetch(`${baseUrl}/backup/restaurar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieFunc },
    body: JSON.stringify({ tipo: 'crediario-digital-backup', clientes: [], debitos: [], notinhas: [] }),
  })
  assert.equal(semPermissaoRes.status, 403)

  const invalidoRes = await fetch(`${baseUrl}/backup/restaurar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ tipo: 'arquivo-qualquer' }),
  })
  assert.equal(invalidoRes.status, 400)

  // round-trip: captura um snapshot do estado atual (só os dados deste
  // arquivo de teste, já que os demais arquivos limpam os próprios fixtures
  // antes deste rodar — a suíte roda com --test-concurrency=1 por causa
  // exatamente desta rota, que substitui TODAS as tabelas de negócio).
  const snapshotRes = await fetch(`${baseUrl}/backup/exportar`, { headers: { Cookie: cookieAdmin } })
  const snapshot = await snapshotRes.json()
  const totalClientesAntes = snapshot.clientes.length

  const ruidoRes = await fetch(`${baseUrl}/clientes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ nome: 'Cliente Ruído Pós-Snapshot' }),
  })
  const ruido = await ruidoRes.json()
  assert.equal((await (await fetch(`${baseUrl}/clientes`, { headers: { Cookie: cookieAdmin } })).json()).length, totalClientesAntes + 1)

  const restaurarRes = await fetch(`${baseUrl}/backup/restaurar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify(snapshot),
  })
  assert.equal(restaurarRes.status, 204)

  const clientesDepoisRes = await fetch(`${baseUrl}/clientes`, { headers: { Cookie: cookieAdmin } })
  const clientesDepois = await clientesDepoisRes.json()
  assert.equal(clientesDepois.length, totalClientesAntes, 'restaurar precisa voltar exatamente para o snapshot, sem o ruído')
  assert.ok(!clientesDepois.some((c: { id: number }) => c.id === ruido.id))
  assert.ok(clientesDepois.some((c: { id: number }) => c.id === clienteId))

  const clienteRestaurado = await (await fetch(`${baseUrl}/clientes/${clienteId}`, { headers: { Cookie: cookieAdmin } })).json()
  assert.equal(clienteRestaurado.honorarioEscritorio, 50, 'campos do cliente precisam ter voltado intactos')
})
