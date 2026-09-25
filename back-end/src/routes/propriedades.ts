import { Router } from 'express'
import * as propriedadeController from '../controllers/propriedadeController.js'

export const propriedadesRouter = Router()

propriedadesRouter.patch('/:id', propriedadeController.atualizar)
