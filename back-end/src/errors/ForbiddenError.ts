import { AppError } from './AppError.js'

export class ForbiddenError extends AppError {
  constructor(message = 'Acesso não autorizado para este perfil.') {
    super(message, 403)
    this.name = 'ForbiddenError'
  }
}
