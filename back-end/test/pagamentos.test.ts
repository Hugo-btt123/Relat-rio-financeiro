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

async function criarDebito(valor: number, descricao = 'Débito') {
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

async function criarNotinha(debitoIds: number[]) {
  const res = await fetch(`${baseUrl}/notinhas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ clienteId, competencia: '05/2026', debitoIds }),
  })
  assert.equal(res.status, 201)
  const notinha = await res.json()
  notinhasCriadas.push(notinha.id)
  return notinha
}

before(async () => {
  const sufixo = Date.now().toString(36)
  loginAdmin = `teste-pag-admin-${sufixo}`
  const adminHash = await bcrypt.hash('senha-admin', 10)
  const admin = await prisma.usuario.create({
    data: { nome: 'Admin Teste Pagamentos', login: loginAdmin, senha: adminHash, papel: 'administrador' },
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
    body: JSON.stringify({ nome: 'Cliente Teste Pagamentos' }),
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
  await prisma.usuario.deleteMany({ where: { id: adminId } })
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await prisma.$disconnect()
})

test('pagar-tudo-dinheiro: fecha todos os itens em aberto e a notinha vira "paga"', async () => {
  const d1 = await criarDebito(300, 'A')
  const d2 = await criarDebito(200, 'B')
  const notinha = await criarNotinha([d1.id, d2.id])

  const res = await fetch(`${baseUrl}/notinhas/${notinha.id}/pagar-tudo-dinheiro`, {
    method: 'POST',
    headers: { Cookie: cookieAdmin },
  })
  assert.equal(res.status, 200)
  const paga = await res.json()
  assert.equal(paga.status, 'paga')
  assert.equal(paga.totalPago, 500)
  assert.equal(paga.totalAberto, 0)
  assert.ok(paga.itens.every((i: { status: string }) => i.status === 'pago'))
})

test('pagar-tudo-pix: itens ficam pixPendente (nunca fecham na hora); confirmar-pix-lote finaliza e quita a notinha', async () => {
  const d1 = await criarDebito(400, 'C')
  const d2 = await criarDebito(100, 'D')
  const notinha = await criarNotinha([d1.id, d2.id])

  const res = await fetch(`${baseUrl}/notinhas/${notinha.id}/pagar-tudo-pix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ obs: 'via Pix' }),
  })
  assert.equal(res.status, 200)
  const aguardando = await res.json()
  assert.equal(aguardando.status, 'ativa', 'não pode virar "paga" enquanto o Pix não foi conferido')
  assert.equal(aguardando.statusExibicao, 'pix_a_conferir')
  assert.ok(aguardando.itens.every((i: { pixPendente: boolean }) => i.pixPendente === true))

  const confirmarRes = await fetch(`${baseUrl}/debitos/confirmar-pix-lote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ ids: [d1.id, d2.id] }),
  })
  assert.equal(confirmarRes.status, 200)

  const buscarRes = await fetch(`${baseUrl}/notinhas/${notinha.id}`, { headers: { Cookie: cookieAdmin } })
  const final = await buscarRes.json()
  assert.equal(final.status, 'paga')
})

test('bug #1: cancelar um débito de uma notinha reduz o total dela', async () => {
  const d1 = await criarDebito(600, 'Fica')
  const d2 = await criarDebito(400, 'Cancela')
  const notinha = await criarNotinha([d1.id, d2.id])
  assert.equal(notinha.total, 1000)

  const cancelarRes = await fetch(`${baseUrl}/debitos/${d2.id}/cancelar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({}),
  })
  assert.equal(cancelarRes.status, 200)

  const notinhaAtualizada = await prisma.notinha.findUnique({ where: { id: notinha.id } })
  assert.equal(Number(notinhaAtualizada?.total), 600, 'total da notinha precisa ter descontado o item cancelado')
})

test('bug #2: estornar uma notinha remove os itens da LISTA dela (não só solta o vínculo)', async () => {
  const d1 = await criarDebito(250, 'Estorna')
  const notinha = await criarNotinha([d1.id])

  const estornarRes = await fetch(`${baseUrl}/notinhas/${notinha.id}/estornar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({}),
  })
  assert.equal(estornarRes.status, 200)
  const estornada = await estornarRes.json()
  assert.equal(estornada.itens.length, 0)

  // se o mesmo débito for reaproveitado numa notinha nova, a notinha estornada
  // antiga não pode "vazar" esse estado novo (é exatamente o bug relatado)
  const novaNotinha = await criarNotinha([d1.id])
  const estornadaDeNovoRes = await fetch(`${baseUrl}/notinhas/${notinha.id}`, { headers: { Cookie: cookieAdmin } })
  const estornadaRefetch = await estornadaDeNovoRes.json()
  assert.equal(estornadaRefetch.itens.length, 0, 'notinha estornada não pode mostrar o item que foi para outra notinha')
  assert.equal(novaNotinha.itens[0].id, d1.id)
})

test('bug #3: "pagar tudo" desconta o crédito que já existia — não pode cobrar em dobro', async () => {
  const d1 = await criarDebito(700, 'Item 1')
  const d2 = await criarDebito(800, 'Item 2')
  const notinha = await criarNotinha([d1.id, d2.id])
  assert.equal(notinha.total, 1500)

  const parcialRes = await fetch(`${baseUrl}/notinhas/${notinha.id}/pagar-parcial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ valor: 500, forma: 'Dinheiro' }),
  })
  assert.equal(parcialRes.status, 200)
  const aposParcial = await parcialRes.json()
  assert.equal(aposParcial.creditoAdiantado, 500, 'R$500 não fecha nenhum item (700 nem 800) — vira crédito')
  assert.equal(aposParcial.totalPago, 500)

  const pagarTudoRes = await fetch(`${baseUrl}/notinhas/${notinha.id}/pagar-tudo-dinheiro`, {
    method: 'POST',
    headers: { Cookie: cookieAdmin },
  })
  assert.equal(pagarTudoRes.status, 200)
  const final = await pagarTudoRes.json()
  assert.equal(final.status, 'paga')
  assert.equal(final.totalPago, 1500, 'total pago tem que ser 1500, não 2000 (500 do parcial + 1500 cobrados de novo)')

  const pagamentos = await prisma.pagamento.findMany({ where: { notinhaId: notinha.id } })
  const somaPagamentos = pagamentos.reduce((s, p) => s + Number(p.valor), 0)
  assert.equal(somaPagamentos, 1500, 'a soma dos registros de Pagamento não pode passar do total da notinha')
})

test('bug #4: pagamento parcial maior que o saldo em aberto é rejeitado (409)', async () => {
  const d1 = await criarDebito(300, 'Teto')
  const notinha = await criarNotinha([d1.id])

  const res = await fetch(`${baseUrl}/notinhas/${notinha.id}/pagar-parcial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ valor: 400, forma: 'Dinheiro' }),
  })
  assert.equal(res.status, 409)
})

test('bug #5: Pix parcial pequeno demais pra fechar até o item mais barato ainda aparece em /pix-pendentes (crédito solto)', async () => {
  const d1 = await criarDebito(1000, 'Caro demais para o Pix pequeno')
  const notinha = await criarNotinha([d1.id])

  const parcialPixRes = await fetch(`${baseUrl}/notinhas/${notinha.id}/pagar-parcial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ valor: 200, forma: 'Pix' }),
  })
  assert.equal(parcialPixRes.status, 200)
  const aposParcial = await parcialPixRes.json()
  assert.equal(aposParcial.creditoPixPendente, 200)
  assert.equal(aposParcial.itens[0].pixPendente, false, 'o item não fechou nem entrou como pixPendente')

  const pixPendentesRes = await fetch(`${baseUrl}/pix-pendentes`, { headers: { Cookie: cookieAdmin } })
  assert.equal(pixPendentesRes.status, 200)
  const linhas = await pixPendentesRes.json()
  const linhaCredito = linhas.find(
    (l: { tipo: string; notinhaId: number }) => l.tipo === 'credito-notinha' && l.notinhaId === notinha.id,
  )
  assert.ok(linhaCredito, 'crédito Pix que não fechou nenhum item precisa aparecer como linha própria — bug mais grave da lista')
  assert.equal(linhaCredito.valor, 200)

  const confirmarRes = await fetch(`${baseUrl}/notinhas/${notinha.id}/confirmar-credito-pix`, {
    method: 'POST',
    headers: { Cookie: cookieAdmin },
  })
  assert.equal(confirmarRes.status, 200)
  const confirmado = await confirmarRes.json()
  assert.equal(confirmado.creditoPixPendente, 0)
  assert.equal(confirmado.creditoAdiantado, 200)

  const pixPendentesDepoisRes = await fetch(`${baseUrl}/pix-pendentes`, { headers: { Cookie: cookieAdmin } })
  const linhasDepois = await pixPendentesDepoisRes.json()
  assert.ok(
    !linhasDepois.some((l: { tipo: string; notinhaId: number }) => l.tipo === 'credito-notinha' && l.notinhaId === notinha.id),
    'depois de confirmado, a linha de crédito solto precisa sumir da fila',
  )
})

test('bug #6: soma de centavos "problemáticos" em ponto flutuante fica redonda em 2 casas', async () => {
  const d1 = await criarDebito(10.1, 'Centavo 1')
  const d2 = await criarDebito(20.2, 'Centavo 2')
  const d3 = await criarDebito(5.05, 'Centavo 3')
  const notinha = await criarNotinha([d1.id, d2.id, d3.id])

  // 10.10 + 20.20 + 5.05 em ponto flutuante puro dá 35.349999999999994
  assert.equal(notinha.total, 35.35)

  const pagarRes = await fetch(`${baseUrl}/notinhas/${notinha.id}/pagar-tudo-dinheiro`, {
    method: 'POST',
    headers: { Cookie: cookieAdmin },
  })
  assert.equal(pagarRes.status, 200)
  const paga = await pagarRes.json()
  assert.equal(paga.totalPago, 35.35)

  const pagamento = await prisma.pagamento.findFirst({ where: { notinhaId: notinha.id } })
  assert.equal(Number(pagamento?.valor), 35.35)
})

test('bug #7: corrigir manualmente o status de um débito para "pago via Pix" não fecha na hora', async () => {
  const debito = await criarDebito(90, 'Correção manual')
  await fetch(`${baseUrl}/debitos/${debito.id}/alterar-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ alvo: 'cobrado' }),
  })

  const res = await fetch(`${baseUrl}/debitos/${debito.id}/alterar-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ alvo: 'pago', pix: true }),
  })
  assert.equal(res.status, 200)
  const resultado = await res.json()
  assert.equal(resultado.status, 'cobrado', 'não pode fechar direto — quebraria a consistência do fluxo de Pix')
  assert.equal(resultado.pixPendente, true)
})

test('GET /pix-pendentes agrupa a notinha inteira quando TODOS os itens estão com Pix pendente', async () => {
  const d1 = await criarDebito(150, 'Agrupado 1')
  const d2 = await criarDebito(250, 'Agrupado 2')
  const notinha = await criarNotinha([d1.id, d2.id])

  await fetch(`${baseUrl}/notinhas/${notinha.id}/pagar-tudo-pix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({}),
  })

  const res = await fetch(`${baseUrl}/pix-pendentes`, { headers: { Cookie: cookieAdmin } })
  const linhas = await res.json()
  const linhaNotinha = linhas.find((l: { tipo: string; notinhaId: number }) => l.tipo === 'notinha' && l.notinhaId === notinha.id)
  assert.ok(linhaNotinha, 'notinha inteira em Pix pendente precisa virar UMA linha só')
  assert.equal(linhaNotinha.valor, 400)
  assert.deepEqual(linhaNotinha.debitoIds.sort(), [d1.id, d2.id].sort())

  const linhasSoltas = linhas.filter((l: { tipo: string; id: number }) => l.tipo === 'debito' && (l.id === d1.id || l.id === d2.id))
  assert.equal(linhasSoltas.length, 0, 'quando agrupado, não pode também aparecer item por item')
})

test('GET /pix-pendentes mostra itens separados quando só PARTE da notinha está com Pix pendente', async () => {
  const d1 = await criarDebito(300, 'Vai ficar pendente')
  const d2 = await criarDebito(200, 'Vai ficar cobrado normal')
  const notinha = await criarNotinha([d1.id, d2.id])

  await fetch(`${baseUrl}/debitos/${d1.id}/alterar-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
    body: JSON.stringify({ alvo: 'pago', pix: true }),
  })

  const res = await fetch(`${baseUrl}/pix-pendentes`, { headers: { Cookie: cookieAdmin } })
  const linhas = await res.json()
  const linhaItem = linhas.find((l: { tipo: string; id: number }) => l.tipo === 'debito' && l.id === d1.id)
  assert.ok(linhaItem, 'item parcialmente pendente precisa aparecer separado')
  assert.equal(linhaItem.pixParcialDaNotinha, true)
  assert.equal(linhaItem.totalNotinha, 500)

  const linhaNotinhaAgrupada = linhas.find((l: { tipo: string; notinhaId: number }) => l.tipo === 'notinha' && l.notinhaId === notinha.id)
  assert.equal(linhaNotinhaAgrupada, undefined, 'não pode agrupar quando só parte está pendente')
})
