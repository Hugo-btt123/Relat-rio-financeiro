import type { Request, Response } from 'express'
import * as notinhaService from '../services/notinhaService.js'
import { paraNotinhaPublica } from '../dto/notinha/notinhaDto.js'
import { parseId } from '../utils/parseId.js'

function textoQuery(valor: unknown, padrao = ''): string {
  return typeof valor === 'string' ? valor : padrao
}

function idsDoBody(valor: unknown): number[] {
  return Array.isArray(valor) ? (valor as unknown[]).map((v) => Number(v)) : []
}

export async function listar(req: Request, res: Response): Promise<void> {
  const notinhas = await notinhaService.listar({
    busca: textoQuery(req.query.busca),
    competencia: textoQuery(req.query.competencia),
    status: textoQuery(req.query.status, 'todas'),
  })
  res.json(notinhas.map(paraNotinhaPublica))
}

export async function buscarPorId(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id)
  const notinha = await notinhaService.buscarPorId(id)
  res.json(paraNotinhaPublica(notinha))
}

export async function criar(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>
  const notinha = await notinhaService.criar(
    {
      clienteId: Number(body.clienteId),
      competencia: String(body.competencia ?? ''),
      observacoes: body.observacoes !== undefined ? String(body.observacoes) : undefined,
      debitoIds: idsDoBody(body.debitoIds),
      incluirHonorario: Boolean(body.incluirHonorario),
    },
    req.usuario!.nome,
  )
  res.status(201).json(paraNotinhaPublica(notinha))
}

export async function atualizar(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id)
  const body = (req.body ?? {}) as Record<string, unknown>
  const notinha = await notinhaService.atualizar(
    id,
    {
      competencia: body.competencia !== undefined ? String(body.competencia) : undefined,
      observacoes: body.observacoes !== undefined ? String(body.observacoes) : undefined,
    },
    req.usuario!.nome,
  )
  res.json(paraNotinhaPublica(notinha))
}

export async function adicionarDebitos(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id)
  const body = (req.body ?? {}) as Record<string, unknown>
  const notinha = await notinhaService.adicionarDebitos(id, idsDoBody(body.debitoIds), req.usuario!.nome)
  res.json(paraNotinhaPublica(notinha))
}

export async function estornar(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id)
  const body = (req.body ?? {}) as Record<string, unknown>
  const notinha = await notinhaService.estornar(id, body.motivo !== undefined ? String(body.motivo) : '', req.usuario!.nome)
  res.json(paraNotinhaPublica(notinha))
}

export async function reabrir(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id)
  const body = (req.body ?? {}) as Record<string, unknown>
  const notinha = await notinhaService.reabrir(id, body.motivo !== undefined ? String(body.motivo) : '', req.usuario!.nome)
  res.json(paraNotinhaPublica(notinha))
}

export async function pagarTotalDinheiro(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id)
  const notinha = await notinhaService.pagarTotalDinheiro(id, req.usuario!.nome)
  res.json(paraNotinhaPublica(notinha))
}

export async function pagarTotalPix(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id)
  const body = (req.body ?? {}) as Record<string, unknown>
  const notinha = await notinhaService.pagarTotalPix(id, body.obs !== undefined ? String(body.obs) : '', req.usuario!.nome)
  res.json(paraNotinhaPublica(notinha))
}

export async function pagarParcial(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id)
  const body = (req.body ?? {}) as Record<string, unknown>
  const notinha = await notinhaService.pagarParcial(
    id,
    {
      valor: Number(body.valor),
      forma: body.forma !== undefined ? String(body.forma) : undefined,
      data: body.data !== undefined ? String(body.data) : undefined,
      obs: body.obs !== undefined ? String(body.obs) : undefined,
    },
    req.usuario!.nome,
  )
  res.json(paraNotinhaPublica(notinha))
}

export async function confirmarCreditoPix(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id)
  const notinha = await notinhaService.confirmarCreditoPix(id, req.usuario!.nome)
  res.json(paraNotinhaPublica(notinha))
}
