import express from 'express'
import cookieParser from 'cookie-parser'
import morgan from 'morgan'
import { router } from './routes/index.js'
import { errorHandler } from './middlewares/errorHandler.js'

export const app = express()

app.use(morgan('dev'))
app.use(express.json({ limit: '20mb' }))
app.use(cookieParser())

app.use(router)

app.use(errorHandler)
