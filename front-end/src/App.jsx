import { Navigate, Route, Routes } from 'react-router-dom'
import { useAutenticacao } from './context/AuthContext.jsx'
import Layout from './components/layout/Layout.jsx'
import LoginPage from './pages/Login/LoginPage.jsx'
import EssencialPage from './pages/Essencial/EssencialPage.jsx'
import ClientesPage from './pages/Clientes/ClientesPage.jsx'
import ClienteDetalhePage from './pages/Clientes/ClienteDetalhePage.jsx'
import NotinhasPage from './pages/Notinhas/NotinhasPage.jsx'
import NovaNotinhaPage from './pages/Notinhas/NovaNotinhaPage.jsx'
import NotinhaDetalhePage from './pages/Notinhas/NotinhaDetalhePage.jsx'
import NotinhasAgrupadasPage from './pages/Notinhas/NotinhasAgrupadasPage.jsx'
import NotinhaEditarPage from './pages/Notinhas/NotinhaEditarPage.jsx'
import ConferirPixPage from './pages/ConferirPix/ConferirPixPage.jsx'
import DashboardPage from './pages/Dashboard/DashboardPage.jsx'
import BuscaGlobalPage from './pages/BuscaGlobal/BuscaGlobalPage.jsx'
import HistoricoPage from './pages/Historico/HistoricoPage.jsx'
import BackupPage from './pages/Backup/BackupPage.jsx'

// Protege as rotas internas: se não houver usuário logado, manda para o login.
function RotaPrivada({ children }) {
  const { usuario, carregando } = useAutenticacao()
  if (carregando) return null
  if (!usuario) return <Navigate to="/login" replace />
  return children
}

// Algumas telas (Dashboard e Histórico) são só para o administrador — o
// funcionário pode ver todo o resto do sistema normalmente. Isso é uma
// proteção "de tela"; quando o back-end entrar, o mesmo deve ser garantido
// também dentro da API/Prisma (ver GUIA-VSCODE-E-PRISMA.md).
function RotaSomenteAdministrador({ children }) {
  const { usuario } = useAutenticacao()
  if (usuario?.papel !== 'administrador') return <Navigate to="/essencial" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <RotaPrivada>
            <Layout />
          </RotaPrivada>
        }
      >
        <Route index element={<Navigate to="/essencial" replace />} />
        <Route path="essencial" element={<EssencialPage />} />
        <Route path="clientes" element={<ClientesPage />} />
        <Route path="clientes/:id" element={<ClienteDetalhePage />} />
        <Route path="notinhas" element={<NotinhasPage />} />
        <Route path="notinhas/nova" element={<NovaNotinhaPage />} />
        <Route path="notinhas/agrupado" element={<NotinhasAgrupadasPage />} />
        <Route path="notinhas/:id" element={<NotinhaDetalhePage />} />
        <Route path="notinhas/:id/editar" element={<NotinhaEditarPage />} />
        <Route
          path="conferir-pix"
          element={
            <RotaSomenteAdministrador>
              <ConferirPixPage />
            </RotaSomenteAdministrador>
          }
        />
        <Route path="busca" element={<BuscaGlobalPage />} />
        <Route path="backup" element={<BackupPage />} />
        <Route
          path="dashboard"
          element={
            <RotaSomenteAdministrador>
              <DashboardPage />
            </RotaSomenteAdministrador>
          }
        />
        <Route
          path="historico"
          element={
            <RotaSomenteAdministrador>
              <HistoricoPage />
            </RotaSomenteAdministrador>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
