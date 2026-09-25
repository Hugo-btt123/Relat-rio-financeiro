import type { Request, Response } from 'express'
import * as debitoService from '../services/debitoService.js'
import { paraDebitoPublico } from '../dto/debito/debitoDto.js'
import { parseId } from '../utils/parseId.js'

function textoQuery(valor: unknown, padrao = ''): string {
  return typeof valor === 'string' ? valor : padrao
}

export async function listar(req: Request, res: Response): Promise<void> {
  const clienteIdRaw = req.query.clienteId
  const clienteId = typeof clienteIdRaw === 'string' && Number.isInteger(Number(clienteIdRaw)) ? Number(clienteIdRaw) : null

  const debitos = await debitoService.listar({
    clienteId,
    status: textoQuery(req.query.status, 'todos'),
    competencia: textoQuery(req.query.competencia),
    busca: textoQuery(req.query.busca),
    apenasPixPendente: req.query.apenasPixPendente === 'true',
  })
  res.json(debitos.map(paraDebitoPublico))
}

export async function criar(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>
  const debito = await debitoService.criar(
    {
      clienteId: Number(body.clienteId),
      propriedadeId: body.propriedadeId !== undefined && body.propriedadeId !== null ? Number(body.propriedadeId) : null,
      descricao: String(body.descricao ?? ''),
      valor: Number(body.valor),
      competencia: String(body.competencia ?? ''),
      observacao: body.observacao !== undefined ? String(body.observacao) : undefined,
    },
    req.usuario!.nome,
  )
  res.status(201).json(paraDebitoPublico(debito))
}

export async function criarEmGrupo(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>
  const linhas = Array.isArray(body.linhas) ? (body.linhas as Record<string, unknown>[]) : []

  const debitos = await debitoService.criarEmGrupo(
    {
      descricao: String(body.descricao ?? ''),
      competencia: String(body.competencia ?? ''),
      linhas: linhas.map((l) => ({
        clienteId: Number(l.clienteId),
        propriedadeId: l.propriedadeId !== undefined && l.propriedadeId !== null ? Number(l.propriedadeId) : null,
        valor: Number(l.valor),
        observacao: l.observacao !== undefined ? String(l.observacao) : undefined,
      })),
    },
    req.usuario!.nome,
  )
  res.status(201).json(debitos.map(paraDebitoPublico))
}

export async function editar(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id)
  const body = (req.body ?? {}) as Record<string, unknown>

  const debito = await debitoService.editar(
    id,
    {
      descricao: body.descricao !== undefined ? String(body.descricao) : undefined,
      valor: body.valor !== undefined ? Number(body.valor) : undefined,
      competencia: body.competencia !== undefined ? String(body.competencia) : undefined,
      observacao: body.observacao !== undefined ? String(body.observacao) : undefined,
      propriedadeId: body.propriedadeId !== undefined ? (body.propriedadeId === null ? null : Number(body.propriedadeId)) : undefined,
    },
    req.usuario!.nome,
  )
  res.json(paraDebitoPublico(debito))
}

export async function cancelar(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id)
  const body = (req.body ?? {}) as Record<string, unknown>
  const debito = await debitoService.cancelar(id, body.motivo !== undefined ? String(body.motivo) : '', req.usuario!.nome)
  res.json(paraDebitoPublico(debito))
}

export async function marcarPagoDinheiro(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id)
  const body = (req.body ?? {}) as Record<string, unknown>
  const debito = await debitoService.marcarPagoDinheiro(
    id,
    {
      formaPagamento: body.formaPagamento !== undefined ? String(body.formaPagamento) : undefined,
      dataPagamento: body.dataPagamento !== undefined ? String(body.dataPagamento) : undefined,
      obs: body.obs !== undefined ? String(body.obs) : undefined,
    },
    req.usuario!.nome,
  )
  res.json(paraDebitoPublico(debito))
}

export async function marcarPagoPix(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id)
  const body = (req.body ?? {}) as Record<string, unknown>
  const debito = await debitoService.marcarPagoPix(id, body.obs !== undefined ? String(body.obs) : '', req.usuario!.nome)
  res.json(paraDebitoPublico(debito))
}

export async function confirmarPix(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id)
  const debito = await debitoService.confirmarPix(id, req.usuario!.nome)
  res.json(paraDebitoPublico(debito))
}

export async function confirmarPixEmLote(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>
  const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map((v) => Number(v)) : []
  const debitos = await debitoService.confirmarPixEmLote(ids, req.usuario!.nome)
  res.json(debitos.map(paraDebitoPublico))
}

export async function alterarStatus(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id)
  const body = (req.body ?? {}) as Record<string, unknown>
  const debito = await debitoService.alterarStatus(
    id,
    String(body.alvo) as debitoService.StatusAlvo,
    {
      pix: Boolean(body.pix),
      obs: body.obs !== undefined ? String(body.obs) : undefined,
      dataPagamento: body.dataPagamento !== undefined ? String(body.dataPagamento) : undefined,
    },
    req.usuario!.nome,
  )
  res.json(paraDebitoPublico(debito))
}
