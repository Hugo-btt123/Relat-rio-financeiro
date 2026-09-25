import type { Request, Response } from 'express'
import * as propriedadeService from '../services/propriedadeService.js'
import { parseId } from '../utils/parseId.js'

export async function atualizar(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id)
  const body = (req.body ?? {}) as Record<string, unknown>

  const propriedade = await propriedadeService.atualizar(
    id,
    {
      nome: body.nome !== undefined ? String(body.nome) : undefined,
      documento: body.documento !== undefined ? String(body.documento) : undefined,
      status: body.status !== undefined ? String(body.status) : undefined,
    },
    req.usuario!.nome,
  )
  res.json(propriedade)
}
