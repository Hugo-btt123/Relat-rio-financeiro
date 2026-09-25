import type { Request, Response } from 'express'
import * as historicoService from '../services/historicoService.js'

export async function listar(req: Request, res: Response): Promise<void> {
  const entidade = typeof req.query.entidade === 'string' ? req.query.entidade : 'todas'
  const operador = typeof req.query.operador === 'string' ? req.query.operador : ''
  const historico = await historicoService.listar({ entidade, operador })
  res.json(historico)
}
