import { AppError } from './AppError.js'

export class ConflictError extends AppError {
  constructor(message = 'Conflito ao processar a solicitação.') {
    super(message, 409)
    this.name = 'ConflictError'
  }
}
