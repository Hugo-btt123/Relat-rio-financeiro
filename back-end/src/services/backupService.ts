import { prisma } from '../database/client.js'
import * as clienteRepository from '../repositories/clienteRepository.js'
import * as propriedadeRepository from '../repositories/propriedadeRepository.js'
import * as debitoRepository from '../repositories/debitoRepository.js'
import * as notinhaRepository from '../repositories/notinhaRepository.js'
import * as historicoRepository from '../repositories/historicoRepository.js'
import * as historicoService from './historicoService.js'
import { paraDebitoPublico } from '../dto/debito/debitoDto.js'
import { paraNotinhaPublica } from '../dto/notinha/notinhaDto.js'
import { ValidationError } from '../errors/ValidationError.js'

const VERSAO_BACKUP = 1
const TIPO_BACKUP = 'crediario-digital-backup'

// Relatório "achatado" para exportação/planilha — mesma forma que
// obterDadosParaExportacao em front-end/src/lib/db.js. Não inclui
// honorarioEscritorio de propósito (quem chama decide se inclui, conforme o
// papel de quem está pedindo — CLAUDE.md §5).
export async function obterDadosParaExportacaoDetalhada() {
  const [clientes, propriedades, debitos, notinhas, historico] = await Promise.all([
    clienteRepository.listar({}),
    propriedadeRepository.listar({}),
    debitoRepository.listar({}),
    notinhaRepository.listar({}),
    historicoRepository.listar({}),
  ])

  const clienteNomePorId = new Map(clientes.map((c) => [c.id, c.nome]))
  const notinhasPublicas = notinhas.map(paraNotinhaPublica)

  return {
    geradoEm: new Date().toISOString(),
    clientes,
    propriedades: propriedades.map((p) => ({
      ...p,
      clienteNome: clienteNomePorId.get(p.clienteId) ?? 'Cliente removido',
    })),
    debitos: debitos.map(paraDebitoPublico),
    notinhas: notinhasPublicas.map(({ itens, ...resto }) => ({ ...resto, quantidadeItens: itens.length })),
    notinhaItens: notinhasPublicas.flatMap((n) => n.itens.map((item) => ({ notinha: n.numero, ...item }))),
    historico,
  }
}

function paraNumeroOuNulo(valor: unknown): number | null {
  return valor === null || valor === undefined ? null : Number(valor)
}

// Backup "de verdade" — dados brutos, restauráveis via restaurarCompleto.
export async function exportarCompleto() {
  const [clientes, propriedades, debitos, notinhas, pagamentos, historico] = await Promise.all([
    prisma.cliente.findMany(),
    prisma.propriedade.findMany(),
    prisma.debito.findMany(),
    prisma.notinha.findMany(),
    prisma.pagamento.findMany(),
    prisma.historico.findMany(),
  ])

  return {
    tipo: TIPO_BACKUP,
    versao: VERSAO_BACKUP,
    geradoEm: new Date().toISOString(),
    clientes: clientes.map((c) => ({ ...c, honorarioEscritorio: Number(c.honorarioEscritorio) })),
    propriedades,
    debitos: debitos.map((d) => ({ ...d, valor: Number(d.valor) })),
    notinhas: notinhas.map((n) => ({
      ...n,
      total: Number(n.total),
      creditoAdiantado: Number(n.creditoAdiantado),
      creditoPixPendente: Number(n.creditoPixPendente),
    })),
    pagamentos: pagamentos.map((p) => ({ ...p, valor: Number(p.valor) })),
    historico,
  }
}

interface RegistroGenerico {
  [chave: string]: unknown
}

// Restaura um backup gerado por exportarCompleto. Por segurança, NÃO mexe em
// Usuario nem na sessão atual — só troca os dados "de negócio". Isso é uma
// substituição TOTAL (delete + recriação com os mesmos ids), então roda tudo
// dentro de uma transação: se qualquer parte falhar, nada muda.
export async function restaurarCompleto(dadosBrutos: unknown, operador?: string): Promise<void> {
  const dados = (dadosBrutos ?? {}) as RegistroGenerico

  if (!dados || dados.tipo !== TIPO_BACKUP) {
    throw new ValidationError('Este arquivo não parece ser um backup válido do Crediário Digital.')
  }
  if (!Array.isArray(dados.clientes) || !Array.isArray(dados.debitos) || !Array.isArray(dados.notinhas)) {
    throw new ValidationError('O arquivo de backup está incompleto ou corrompido.')
  }

  const clientes = dados.clientes as RegistroGenerico[]
  const propriedades = (Array.isArray(dados.propriedades) ? dados.propriedades : []) as RegistroGenerico[]
  const notinhas = dados.notinhas as RegistroGenerico[]
  const debitos = dados.debitos as RegistroGenerico[]
  const pagamentos = (Array.isArray(dados.pagamentos) ? dados.pagamentos : []) as RegistroGenerico[]
  const historico = (Array.isArray(dados.historico) ? dados.historico : []) as RegistroGenerico[]

  await prisma.$transaction(async (tx) => {
    await tx.historico.deleteMany({})
    await tx.pagamento.deleteMany({})
    await tx.debito.deleteMany({})
    await tx.notinha.deleteMany({})
    await tx.propriedade.deleteMany({})
    await tx.cliente.deleteMany({})

    if (clientes.length > 0) {
      await tx.cliente.createMany({
        data: clientes.map((c) => ({
          id: Number(c.id),
          nome: String(c.nome ?? ''),
          cpf: (c.cpf as string | null | undefined) ?? null,
          telefone: (c.telefone as string | null | undefined) ?? null,
          observacoes: (c.observacoes as string | null | undefined) ?? null,
          status: String(c.status ?? 'ativo'),
          honorarioEscritorio: Number(c.honorarioEscritorio ?? 0),
          criadoEm: c.criadoEm ? new Date(c.criadoEm as string) : new Date(),
        })),
      })
    }

    if (propriedades.length > 0) {
      await tx.propriedade.createMany({
        data: propriedades.map((p) => ({
          id: Number(p.id),
          clienteId: Number(p.clienteId),
          nome: String(p.nome ?? ''),
          documento: (p.documento as string | null | undefined) ?? null,
          status: String(p.status ?? 'ativo'),
          criadoEm: p.criadoEm ? new Date(p.criadoEm as string) : new Date(),
        })),
      })
    }

    if (notinhas.length > 0) {
      await tx.notinha.createMany({
        data: notinhas.map((n) => ({
          id: Number(n.id),
          clienteId: Number(n.clienteId),
          competencia: String(n.competencia ?? ''),
          observacoes: (n.observacoes as string | null | undefined) ?? null,
          total: Number(n.total ?? 0),
          status: String(n.status ?? 'ativa') as 'ativa' | 'paga' | 'estornada',
          creditoAdiantado: Number(n.creditoAdiantado ?? 0),
          creditoPixPendente: Number(n.creditoPixPendente ?? 0),
          criadoEm: n.criadoEm ? new Date(n.criadoEm as string) : new Date(),
          criadoPor: (n.criadoPor as string | null | undefined) ?? null,
        })),
      })
    }

    if (debitos.length > 0) {
      await tx.debito.createMany({
        data: debitos.map((d) => ({
          id: Number(d.id),
          clienteId: Number(d.clienteId),
          propriedadeId: paraNumeroOuNulo(d.propriedadeId),
          descricao: String(d.descricao ?? ''),
          valor: Number(d.valor ?? 0),
          competencia: String(d.competencia ?? ''),
          observacao: (d.observacao as string | null | undefined) ?? null,
          status: String(d.status ?? 'aberto') as 'aberto' | 'cobrado' | 'pago' | 'cancelado',
          notinhaId: paraNumeroOuNulo(d.notinhaId),
          competenciaNotinha: (d.competenciaNotinha as string | null | undefined) ?? null,
          pixPendente: Boolean(d.pixPendente),
          formaPagamento: (d.formaPagamento as string | null | undefined) ?? null,
          dataPagamento: d.dataPagamento ? new Date(d.dataPagamento as string) : null,
          obsPagamento: (d.obsPagamento as string | null | undefined) ?? null,
          criadoEm: d.criadoEm ? new Date(d.criadoEm as string) : new Date(),
          criadoPor: (d.criadoPor as string | null | undefined) ?? null,
          atualizadoEm: d.atualizadoEm ? new Date(d.atualizadoEm as string) : new Date(),
        })),
      })
    }

    if (pagamentos.length > 0) {
      await tx.pagamento.createMany({
        data: pagamentos.map((p) => ({
          id: Number(p.id),
          notinhaId: Number(p.notinhaId),
          valor: Number(p.valor ?? 0),
          forma: String(p.forma ?? ''),
          data: p.data ? new Date(p.data as string) : null,
          obs: (p.obs as string | null | undefined) ?? null,
          tipo: String(p.tipo ?? 'total'),
          pix: Boolean(p.pix),
          confirmado: p.confirmado !== undefined ? Boolean(p.confirmado) : true,
          criadoEm: p.criadoEm ? new Date(p.criadoEm as string) : new Date(),
        })),
      })
    }

    if (historico.length > 0) {
      await tx.historico.createMany({
        data: historico.map((h) => ({
          id: Number(h.id),
          quando: h.quando ? new Date(h.quando as string) : new Date(),
          entidade: String(h.entidade ?? ''),
          entidadeId: (h.entidadeId as string | null | undefined) ?? null,
          entidadeLabel: (h.entidadeLabel as string | null | undefined) ?? null,
          acao: String(h.acao ?? ''),
          operador: (h.operador as string | null | undefined) ?? null,
          detalhes: (h.detalhes as string | null | undefined) ?? null,
          clienteId: paraNumeroOuNulo(h.clienteId),
        })),
      })
    }

    for (const tabela of ['Cliente', 'Propriedade', 'Notinha', 'Debito', 'Pagamento', 'Historico']) {
      await tx.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"${tabela}"', 'id'), COALESCE((SELECT MAX(id) FROM "${tabela}"), 1))`,
      )
    }
  })

  const geradoEm = dados.geradoEm ? new Date(dados.geradoEm as string).toLocaleString('pt-BR') : 'data desconhecida'
  await historicoService.registrar({
    entidade: 'Sistema',
    entidadeId: 'backup',
    entidadeLabel: 'Restauração de backup',
    acao: 'Backup restaurado',
    detalhes: `Backup gerado em ${geradoEm}`,
    operador,
  })
}
