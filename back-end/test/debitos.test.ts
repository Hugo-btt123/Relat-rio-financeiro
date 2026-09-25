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

async function criarDebitoFixture(overrides: Partial<{ descricao: string; valor: number; competencia: string }> = {}) {
  const res = await fetch(`${baseUrl}/debitos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({
      clienteId,
      descricao: overrides.descricao ?? 'FGTS',
      valor: overrides.valor ?? 100,
      competencia: overrides.competencia ?? '05/2026',
    }),
  })
  assert.equal(res.status, 201)
  const debito = await res.json()
  debitosCriados.push(debito.id)
  return debito
}

// Cria uma notinha diretamente via Prisma (rotas de Notinha só existem na Fase 6)
// e vincula um débito 'pago' a ela, para testar os efeitos colaterais que
// cancelar/alterarStatus de Débito precisam ter sobre a Notinha (Fase 5).
async function criarNotinhaComDebitoPago(valor: number) {
  const notinha = await prisma.notinha.create({
    data: { clienteId, competencia: '05/2026', total: valor, status: 'ativa' },
  })
  notinhasCriadas.push(notinha.id)

  const debito = await criarDebitoFixture({ valor })
  await prisma.debito.update({
    where: { id: debito.id },
    data: { notinhaId: notinha.id, competenciaNotinha: '05/2026', status: 'cobrado' },
  })

  const alterarRes = await fetch(`${baseUrl}/debitos/${debito.id}/alterar-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ alvo: 'pago', pix: false }),
  })
  assert.equal(alterarRes.status, 200)

  const notinhaPaga = await prisma.notinha.findUnique({ where: { id: notinha.id } })
  assert.equal(notinhaPaga?.status, 'paga', 'pré-condição: notinha devia estar paga (único item, agora pago)')

  return { notinhaId: notinha.id, debitoId: debito.id }
}

before(async () => {
  const sufixo = Date.now().toString(36)
  loginAdmin = `teste-deb-admin-${sufixo}`
  const adminHash = await bcrypt.hash('senha-admin', 10)
  const admin = await prisma.usuario.create({
    data: { nome: 'Admin Teste Débitos', login: loginAdmin, senha: adminHash, papel: 'administrador' },
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
    body: JSON.stringify({ nome: 'Cliente Teste Débitos' }),
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

test('POST /debitos valida campos obrigatórios e competência, e cria com status aberto', async () => {
  const semDescricao = await fetch(`${baseUrl}/debitos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ clienteId, valor: 100, competencia: '05/2026' }),
  })
  assert.equal(semDescricao.status, 400)

  const competenciaInvalida = await fetch(`${baseUrl}/debitos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ clienteId, descricao: 'INSS', valor: 100, competencia: '13/2026' }),
  })
  assert.equal(competenciaInvalida.status, 400)

  const valorZero = await fetch(`${baseUrl}/debitos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ clienteId, descricao: 'INSS', valor: 0, competencia: '05/2026' }),
  })
  assert.equal(valorZero.status, 400)

  const debito = await criarDebitoFixture({ descricao: 'INSS', valor: 340 })
  assert.equal(debito.status, 'aberto')
  assert.equal(debito.valor, 340)
  assert.equal(debito.clienteNome, 'Cliente Teste Débitos')
})

test('PATCH /debitos/:id edita enquanto aberto; deixa de ser permitido depois de cobrado (409)', async () => {
  const debito = await criarDebitoFixture({ descricao: 'IRPF', valor: 200 })

  const editarRes = await fetch(`${baseUrl}/debitos/${debito.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ valor: 250 }),
  })
  assert.equal(editarRes.status, 200)
  const editado = await editarRes.json()
  assert.equal(editado.valor, 250)

  const paraCobradoRes = await fetch(`${baseUrl}/debitos/${debito.id}/alterar-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ alvo: 'cobrado' }),
  })
  assert.equal(paraCobradoRes.status, 200)

  const editarDepoisRes = await fetch(`${baseUrl}/debitos/${debito.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ valor: 999 }),
  })
  assert.equal(editarDepoisRes.status, 409)
})

test('POST /debitos/:id/cancelar cancela (aberto ou cobrado) e reduz o total da notinha (bug #1); não pode cancelar 2x', async () => {
  const avulso = await criarDebitoFixture({ descricao: 'Cancelável', valor: 80 })
  const cancelarRes = await fetch(`${baseUrl}/debitos/${avulso.id}/cancelar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ motivo: 'lançado errado' }),
  })
  assert.equal(cancelarRes.status, 200)
  const cancelado = await cancelarRes.json()
  assert.equal(cancelado.status, 'cancelado')

  const cancelarDeNovoRes = await fetch(`${baseUrl}/debitos/${avulso.id}/cancelar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({}),
  })
  assert.equal(cancelarDeNovoRes.status, 409)

  const notinha = await prisma.notinha.create({ data: { clienteId, competencia: '05/2026', total: 300, status: 'ativa' } })
  notinhasCriadas.push(notinha.id)
  const itemDaNotinha = await criarDebitoFixture({ descricao: 'Item da notinha', valor: 300 })
  await prisma.debito.update({
    where: { id: itemDaNotinha.id },
    data: { notinhaId: notinha.id, competenciaNotinha: '05/2026', status: 'cobrado' },
  })

  const cancelarItemRes = await fetch(`${baseUrl}/debitos/${itemDaNotinha.id}/cancelar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({}),
  })
  assert.equal(cancelarItemRes.status, 200)

  const notinhaAtualizada = await prisma.notinha.findUnique({ where: { id: notinha.id } })
  assert.equal(Number(notinhaAtualizada?.total), 0, 'total da notinha devia ter sido reduzido no valor do item cancelado')
})

test('alterarStatusDebito: aberto -> cobrado -> pago (dinheiro fecha na hora)', async () => {
  const debito = await criarDebitoFixture({ descricao: 'Dinheiro', valor: 150 })

  const paraCobrado = await fetch(`${baseUrl}/debitos/${debito.id}/alterar-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ alvo: 'cobrado' }),
  })
  assert.equal(paraCobrado.status, 200)
  const cobrado = await paraCobrado.json()
  assert.equal(cobrado.status, 'cobrado')
  assert.equal(cobrado.pixPendente, false)

  const paraPagoDinheiro = await fetch(`${baseUrl}/debitos/${debito.id}/alterar-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ alvo: 'pago', pix: false }),
  })
  assert.equal(paraPagoDinheiro.status, 200)
  const pago = await paraPagoDinheiro.json()
  assert.equal(pago.status, 'pago')
  assert.equal(pago.pixPendente, false)
  assert.equal(pago.formaPagamento, 'Dinheiro')
})

test('alterarStatusDebito: alvo "pago" com pix=true NUNCA fecha na hora (bug #7) — só via confirmar-pix', async () => {
  const debito = await criarDebitoFixture({ descricao: 'Pix corrigido manualmente', valor: 90 })

  const paraCobrado = await fetch(`${baseUrl}/debitos/${debito.id}/alterar-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ alvo: 'cobrado' }),
  })
  assert.equal(paraCobrado.status, 200)

  const paraPagoPix = await fetch(`${baseUrl}/debitos/${debito.id}/alterar-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ alvo: 'pago', pix: true }),
  })
  assert.equal(paraPagoPix.status, 200)
  const resultado = await paraPagoPix.json()
  assert.equal(resultado.status, 'cobrado', 'pago via Pix não pode fechar na hora — fica "cobrado"')
  assert.equal(resultado.pixPendente, true)

  const confirmarRes = await fetch(`${baseUrl}/debitos/${debito.id}/confirmar-pix`, {
    method: 'POST',
    headers: { Cookie: cookieAdmin },
  })
  assert.equal(confirmarRes.status, 200)
  const confirmado = await confirmarRes.json()
  assert.equal(confirmado.status, 'pago')
  assert.equal(confirmado.pixPendente, false)
  assert.equal(confirmado.formaPagamento, 'Pix')
})

test('alterarStatusDebito: pago -> aberto desvincula da notinha e reduz o total dela', async () => {
  const { notinhaId, debitoId } = await criarNotinhaComDebitoPago(500)

  const voltarParaAbertoRes = await fetch(`${baseUrl}/debitos/${debitoId}/alterar-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ alvo: 'aberto' }),
  })
  assert.equal(voltarParaAbertoRes.status, 200)
  const debitoAberto = await voltarParaAbertoRes.json()
  assert.equal(debitoAberto.status, 'aberto')
  assert.equal(debitoAberto.notinhaId, null)

  const notinha = await prisma.notinha.findUnique({ where: { id: notinhaId } })
  assert.equal(Number(notinha?.total), 0)
})

test('alterarStatusDebito: pago -> cobrado mantém vínculo com a notinha e reabre a notinha automaticamente', async () => {
  const { notinhaId, debitoId } = await criarNotinhaComDebitoPago(700)

  const voltarParaCobradoRes = await fetch(`${baseUrl}/debitos/${debitoId}/alterar-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ alvo: 'cobrado' }),
  })
  assert.equal(voltarParaCobradoRes.status, 200)
  const debitoCobrado = await voltarParaCobradoRes.json()
  assert.equal(debitoCobrado.status, 'cobrado')
  assert.equal(debitoCobrado.notinhaId, notinhaId, 'continua vinculado à mesma notinha')

  const notinha = await prisma.notinha.findUnique({ where: { id: notinhaId } })
  assert.equal(notinha?.status, 'ativa', 'notinha devia voltar sozinha para "ativa"')
  assert.equal(Number(notinha?.total), 700, 'total da notinha não muda ao só corrigir status')
})

test('alterarStatusDebito: débito cancelado não pode mudar de status (409); alvo inválido é 400', async () => {
  const debito = await criarDebitoFixture({ descricao: 'Vai ser cancelado', valor: 50 })
  await fetch(`${baseUrl}/debitos/${debito.id}/cancelar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({}),
  })

  const alterarCanceladoRes = await fetch(`${baseUrl}/debitos/${debito.id}/alterar-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ alvo: 'aberto' }),
  })
  assert.equal(alterarCanceladoRes.status, 409)

  const outro = await criarDebitoFixture({ descricao: 'Alvo inválido', valor: 60 })
  const alvoInvalidoRes = await fetch(`${baseUrl}/debitos/${outro.id}/alterar-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ alvo: 'invalido' }),
  })
  assert.equal(alvoInvalidoRes.status, 400)
})

test('POST /debitos/lote cria débitos para várias linhas válidas e ignora linhas sem valor', async () => {
  const outroClienteRes = await fetch(`${baseUrl}/clientes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ nome: 'Outro Cliente Lote' }),
  })
  const outroCliente = await outroClienteRes.json()
  clientesCriados.push(outroCliente.id)

  const loteRes = await fetch(`${baseUrl}/debitos/lote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({
      descricao: 'Taxa Mensal',
      competencia: '05/2026',
      linhas: [
        { clienteId, valor: 120 },
        { clienteId: outroCliente.id, valor: 0 },
        { clienteId: outroCliente.id, valor: 80 },
      ],
    }),
  })
  assert.equal(loteRes.status, 201)
  const criados = await loteRes.json()
  assert.equal(criados.length, 2)
  criados.forEach((d: { id: number }) => debitosCriados.push(d.id))
})
