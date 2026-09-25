import { useNavigate } from 'react-router-dom'
import { useAutenticacao } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'

export default function Topbar() {
  const { usuario, sair } = useAutenticacao()
  const { notificar } = useToast()
  const navegar = useNavigate()

  async function aoTrocar() {
    await sair()
    notificar('Sessão encerrada.', 'info')
    navegar('/login', { replace: true })
  }

  return (
    <header className="cd-topbar">
      <div className="cd-topbar__titulo">
        <i className="bi bi-journal-bookmark" style={{ color: 'var(--cd-dourado-500)' }} />
        Caderno Digital
      </div>
      <div className="cd-topbar__usuario">
        <i className="bi bi-person-circle" />
        <span>{usuario?.nome}</span>
        <button type="button" className="btn btn-sm btn-cd-secundario" onClick={aoTrocar}>
          <i className="bi bi-box-arrow-right me-1" />
          trocar
        </button>
      </div>
    </header>
  )
}
