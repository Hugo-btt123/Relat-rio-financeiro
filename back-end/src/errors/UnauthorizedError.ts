import { AppError } from './AppError.js'

export class UnauthorizedError extends AppError {
  constructor(message = 'Autenticação necessária.') {
    super(message, 401)
    this.name = 'UnauthorizedError'
  }
}
