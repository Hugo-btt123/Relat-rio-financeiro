import type { Request, Response } from 'express'
import * as clienteService from '../services/clienteService.js'
import * as propriedadeService from '../services/propriedadeService.js'
import { paraClientePublico, type Papel } from '../dto/cliente/clienteDto.js'
import { parseId } from '../utils/parseId.js'

function papelDoUsuario(req: Request): Papel {
  return req.usuario!.papel
}

function textoQuery(valor: unknown, padrao = ''): string {
  return typeof valor === 'string' ? valor : padrao
}

export async function listar(req: Request, res: Response): Promise<void> {
  const clientes = await clienteService.listar({
    busca: textoQuery(req.query.busca),
    status: textoQuery(req.query.status, 'todos'),
  })
  res.json(clientes.map((c) => paraClientePublico(c, papelDoUsuario(req))))
}

export async function buscarPorNome(req: Request, res: Response): Promise<void> {
  const clientes = await clienteService.buscarPorNome(textoQuery(req.query.texto))
  res.json(clientes.map((c) => paraClientePublico(c, papelDoUsuario(req))))
}

export async function buscarPorId(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id)
  const cliente = await clienteService.buscarPorId(id)
  res.json(paraClientePublico(cliente, papelDoUsuario(req)))
}

export async function criar(req: Request, res: Response): Promise<void> {
  const papel = papelDoUsuario(req)
  const body = (req.body ?? {}) as Record<string, unknown>

  const cliente = await clienteService.criar({
    nome: String(body.nome ?? ''),
    cpf: body.cpf !== undefined ? String(body.cpf) : undefined,
    telefone: body.telefone !== undefined ? String(body.telefone) : undefined,
    observacoes: body.observacoes !== undefined ? String(body.observacoes) : undefined,
    honorarioEscritorio: papel === 'administrador' && body.honorarioEscritorio !== undefined ? Number(body.honorarioEscritorio) : undefined,
  })
  res.status(201).json(paraClientePublico(cliente, papel))
}

export async function atualizar(req: Request, res: Response): Promise<void> {
  const papel = papelDoUsuario(req)
  const id = parseId(req.params.id)
  const body = (req.body ?? {}) as Record<string, unknown>

  const cliente = await clienteService.atualizar(id, {
    nome: body.nome !== undefined ? String(body.nome) : undefined,
    cpf: body.cpf !== undefined ? String(body.cpf) : undefined,
    telefone: body.telefone !== undefined ? String(body.telefone) : undefined,
    observacoes: body.observacoes !== undefined ? String(body.observacoes) : undefined,
    status: body.status !== undefined ? String(body.status) : undefined,
    honorarioEscritorio: papel === 'administrador' && body.honorarioEscritorio !== undefined ? Number(body.honorarioEscritorio) : undefined,
  })
  res.json(paraClientePublico(cliente, papel))
}

export async function listarPropriedades(req: Request, res: Response): Promise<void> {
  const clienteId = parseId(req.params.id)
  await clienteService.buscarPorId(clienteId)
  const apenasAtivas = req.query.apenasAtivas !== 'false'
  const propriedades = await propriedadeService.listar(clienteId, apenasAtivas)
  res.json(propriedades)
}

export async function criarPropriedade(req: Request, res: Response): Promise<void> {
  const clienteId = parseId(req.params.id)
  await clienteService.buscarPorId(clienteId)
  const body = (req.body ?? {}) as Record<string, unknown>

  const propriedade = await propriedadeService.criar(clienteId, {
    nome: body.nome !== undefined ? String(body.nome) : undefined,
    documento: body.documento !== undefined ? String(body.documento) : undefined,
  })
  res.status(201).json(propriedade)
}
