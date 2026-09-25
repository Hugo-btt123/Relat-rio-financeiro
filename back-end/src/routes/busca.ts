import { Router } from 'express'
import { buscar } from '../controllers/buscaController.js'

export const buscaRouter = Router()

buscaRouter.get('/', buscar)
