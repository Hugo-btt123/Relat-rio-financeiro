import type { Request, Response } from 'express'
import * as dashboardService from '../services/dashboardService.js'

export async function obterMetricas(req: Request, res: Response): Promise<void> {
  const competencia = typeof req.query.competencia === 'string' ? req.query.competencia : ''
  const metricas = await dashboardService.obterMetricas(competencia)
  res.json(metricas)
}
