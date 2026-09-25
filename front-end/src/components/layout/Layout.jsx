import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import Topbar from './Topbar.jsx'

export default function Layout() {
  return (
    <div className="cd-app">
      <Sidebar />
      <div className="cd-conteudo">
        <Topbar />
        <main className="cd-pagina">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
