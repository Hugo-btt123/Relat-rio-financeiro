import type { Request, Response } from 'express'
import * as backupService from '../services/backupService.js'
import { paraClientePublico, type Papel } from '../dto/cliente/clienteDto.js'

export async function exportarDetalhado(req: Request, res: Response): Promise<void> {
  const dados = await backupService.obterDadosParaExportacaoDetalhada()
  const papel = req.usuario!.papel as Papel
  res.json({ ...dados, clientes: dados.clientes.map((c) => paraClientePublico(c, papel)) })
}

export async function exportarCompleto(req: Request, res: Response): Promise<void> {
  const dados = await backupService.exportarCompleto()
  const papel = req.usuario!.papel as Papel
  res.json({
    ...dados,
    clientes: dados.clientes.map((c) => {
      const { honorarioEscritorio, ...resto } = c
      return papel === 'administrador' ? c : resto
    }),
  })
}

export async function restaurarCompleto(req: Request, res: Response): Promise<void> {
  await backupService.restaurarCompleto(req.body, req.usuario!.nome)
  res.status(204).send()
}
