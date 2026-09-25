import { Router } from 'express'
import * as clienteController from '../controllers/clienteController.js'

export const clientesRouter = Router()

clientesRouter.get('/buscar-por-nome', clienteController.buscarPorNome)
clientesRouter.get('/', clienteController.listar)
clientesRouter.post('/', clienteController.criar)
clientesRouter.get('/:id', clienteController.buscarPorId)
clientesRouter.patch('/:id', clienteController.atualizar)
clientesRouter.get('/:id/propriedades', clienteController.listarPropriedades)
clientesRouter.post('/:id/propriedades', clienteController.criarPropriedade)
