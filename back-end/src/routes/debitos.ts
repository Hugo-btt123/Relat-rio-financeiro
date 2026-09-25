import { Router } from 'express'
import * as debitoController from '../controllers/debitoController.js'

export const debitosRouter = Router()

debitosRouter.get('/', debitoController.listar)
debitosRouter.post('/', debitoController.criar)
debitosRouter.post('/lote', debitoController.criarEmGrupo)
debitosRouter.post('/confirmar-pix-lote', debitoController.confirmarPixEmLote)
debitosRouter.patch('/:id', debitoController.editar)
debitosRouter.post('/:id/cancelar', debitoController.cancelar)
debitosRouter.post('/:id/pagar-dinheiro', debitoController.marcarPagoDinheiro)
debitosRouter.post('/:id/pagar-pix', debitoController.marcarPagoPix)
debitosRouter.post('/:id/confirmar-pix', debitoController.confirmarPix)
debitosRouter.post('/:id/alterar-status', debitoController.alterarStatus)
