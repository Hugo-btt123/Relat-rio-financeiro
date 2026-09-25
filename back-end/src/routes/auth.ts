import { Router } from 'express'
import { login, logout, me } from '../controllers/authController.js'
import { exigirLogin } from '../middlewares/auth.js'

export const authRouter = Router()

authRouter.post('/login', login)
authRouter.post('/logout', logout)
authRouter.get('/me', exigirLogin, me)
