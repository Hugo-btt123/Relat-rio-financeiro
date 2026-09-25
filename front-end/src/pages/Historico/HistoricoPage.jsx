import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as db from '../../lib/db.js'
import { formatarDataHora } from '../../lib/format.js'

const ENTIDADES = ['todas', 'Débito', 'Cliente', 'Propriedade', 'Notinha', 'Usuário', 'Sistema']

// Mostra as últimas 300 alterações feitas no sistema — quem fez o quê e
// quando. Serve como trilha de auditoria (nada é apagado, tudo é logado).
export default function HistoricoPage() {
  const navegar = useNavigate()
  const [entidade, setEntidade] = useState('todas')
  const [operador, setOperador] = useState('')
  const [lista, setLista] = useState([])
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const l = await db.listarHistorico({ entidade, operador })
    setLista(l)
    setCarregando(false)
  }, [entidade, operador])

  useEffect(() => { carregar() }, [carregar])

  function abrir(item) {
    if (item.entidade === 'Notinha') navegar(`/notinhas/${item.entidadeId}`)
    else if (item.entidade === 'Débito' && item.clienteId) navegar(`/clientes/${item.clienteId}`)
    else if (item.entidade === 'Cliente') navegar(`/clientes/${item.entidadeId}`)
  }

  return (
    <div>
      <div className="cd-pagina__cabecalho">
        <h1>Histórico de alterações</h1>
        <p className="cd-pagina__subtitulo">Quem fez o quê, quando. Últimos 300 eventos.</p>
      </div>

      <div className="d-flex gap-2 mb-3">
        <div>
          <label className="cd-label">Entidade</label>
          <select className="form-select" style={{ width: 160 }} value={entidade} onChange={(e) => setEntidade(e.target.value)}>
            {ENTIDADES.map((e) => <option key={e} value={e}>{e === 'todas' ? 'Todas' : e}</option>)}
          </select>
        </div>
        <div>
          <label className="cd-label">Operador</label>
          <input type="text" className="form-control" style={{ width: 220 }} placeholder="Filtrar por nome..." value={operador} onChange={(e) => setOperador(e.target.value)} />
        </div>
      </div>

      <div className="cd-card">
        {carregando ? (
          <div className="cd-vazio">Carregando...</div>
        ) : lista.length === 0 ? (
          <div className="cd-vazio">Nenhum evento encontrado.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cd-tabela">
              <thead>
                <tr><th>Quando</th><th>Entidade</th><th>Ação</th><th>Detalhes</th><th>Operador</th><th></th></tr>
              </thead>
              <tbody>
                {lista.map((h) => (
                  <tr key={h.id}>
                    <td className="texto-suave" style={{ whiteSpace: 'nowrap' }}>{formatarDataHora(h.quando)}</td>
                    <td><span className="cd-badge cd-badge--neutro">{h.entidade}</span></td>
                    <td>{h.acao}</td>
                    <td className="texto-suave">{h.entidadeLabel}{h.detalhes ? ` — ${h.detalhes}` : ''}</td>
                    <td>{h.operador}</td>
                    <td className="text-end">
                      {(h.entidade === 'Notinha' || h.entidade === 'Cliente' || (h.entidade === 'Débito' && h.clienteId)) && (
                        <a className="link-discreto" style={{ cursor: 'pointer' }} onClick={() => abrir(h)}>abrir</a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
