import type { Request, Response } from 'express'
import * as buscaService from '../services/buscaService.js'
import { paraClientePublico, type Papel } from '../dto/cliente/clienteDto.js'
import { paraDebitoPublico } from '../dto/debito/debitoDto.js'
import { paraNotinhaPublica } from '../dto/notinha/notinhaDto.js'

export async function buscar(req: Request, res: Response): Promise<void> {
  const texto = typeof req.query.texto === 'string' ? req.query.texto : ''
  const resultado = await buscaService.buscaGlobal(texto)
  const papel = req.usuario!.papel as Papel

  res.json({
    clientes: resultado.clientes.map((c) => paraClientePublico(c, papel)),
    debitos: resultado.debitos.map(paraDebitoPublico),
    notinhas: resultado.notinhas.map(paraNotinhaPublica),
  })
}
