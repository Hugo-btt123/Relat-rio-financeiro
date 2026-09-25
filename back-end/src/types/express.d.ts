import 'express'

declare global {
  namespace Express {
    interface Request {
      usuario?: {
        id: number
        papel: 'administrador' | 'funcionario'
        nome: string
      }
    }
  }
}

export {}
