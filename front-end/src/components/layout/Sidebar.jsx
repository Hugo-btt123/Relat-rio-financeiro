import { NavLink } from 'react-router-dom'
import { useAutenticacao } from '../../context/AuthContext.jsx'
import logo from '../../assets/logo.png'

// Lista de itens do menu — igual ao protótipo que o cliente mostrou, na
// mesma ordem (Essencial, Clientes, Notinhas, Conferir Pix, Dashboard,
// Busca global, Histórico, Backup). Os itens marcados com `somenteAdmin`
// só aparecem para quem tem papel "administrador" (o funcionário não vê
// Dashboard nem Histórico, como combinado).
const ITENS_MENU = [
  { rota: '/essencial', rotulo: 'Essencial', icone: 'bi-journal-text' },
  { rota: '/clientes', rotulo: 'Clientes', icone: 'bi-people' },
  { rota: '/notinhas', rotulo: 'Notinhas', icone: 'bi-receipt' },
  { rota: '/conferir-pix', rotulo: 'Conferir Pix', icone: 'bi-phone', somenteAdmin: true },
  { rota: '/dashboard', rotulo: 'Dashboard', icone: 'bi-grid-1x2', somenteAdmin: true },
  { rota: '/busca', rotulo: 'Busca global', icone: 'bi-search' },
  { rota: '/historico', rotulo: 'Histórico', icone: 'bi-clock-history', somenteAdmin: true },
  { rota: '/backup', rotulo: 'Backup', icone: 'bi-cloud-arrow-down' },
]

export default function Sidebar() {
  const { usuario } = useAutenticacao()
  const ehAdministrador = usuario?.papel === 'administrador'

  return (
    <aside className="cd-sidebar">
      <div className="cd-sidebar__marca">
        <div className="cd-sidebar__marca-icone">
          <img src={logo} alt="Logo" />
        </div>
        <div>
          <div className="cd-sidebar__marca-texto">ATUAL</div>
          <div className="cd-sidebar__marca-sub">Escritório Contábil</div>
        </div>
      </div>

      <nav>
        {ITENS_MENU.filter((item) => !item.somenteAdmin || ehAdministrador).map((item) => (
          <NavLink
            key={item.rota}
            to={item.rota}
            className={({ isActive }) => `cd-sidebar__link${isActive ? ' ativo' : ''}`}
          >
            <i className={`bi ${item.icone}`} />
            <span>{item.rotulo}</span>
          </NavLink>
        ))}
      </nav>

      <div className="cd-sidebar__rodape">Escritório Contábil Atual · v1.0</div>
    </aside>
  )
}
