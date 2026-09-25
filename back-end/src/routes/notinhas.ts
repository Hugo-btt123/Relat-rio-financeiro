import { Router } from 'express'
import * as notinhaController from '../controllers/notinhaController.js'

export const notinhasRouter = Router()

notinhasRouter.get('/', notinhaController.listar)
notinhasRouter.post('/', notinhaController.criar)
notinhasRouter.get('/:id', notinhaController.buscarPorId)
notinhasRouter.patch('/:id', notinhaController.atualizar)
notinhasRouter.post('/:id/adicionar-debitos', notinhaController.adicionarDebitos)
notinhasRouter.post('/:id/estornar', notinhaController.estornar)
notinhasRouter.post('/:id/reabrir', notinhaController.reabrir)
