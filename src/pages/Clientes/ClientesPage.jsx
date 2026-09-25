import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as db from '../../lib/db.js'
import { listarIdsRecentes } from '../../lib/recentes.js'
import { useToast } from '../../context/ToastContext.jsx'
import ClienteFormModal from './ClienteFormModal.jsx'

export default function ClientesPage() {
  const navegar = useNavigate()
  const { notificar } = useToast()

  const [clientes, setClientes] = useState([])
  const [recentes, setRecentes] = useState([])
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState('todos')
  const [carregando, setCarregando] = useState(true)
  const [modalNovo, setModalNovo] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const lista = await db.listarClientes({ busca, status })
    setClientes(lista)
    setCarregando(false)

    const idsRecentes = listarIdsRecentes()
    if (idsRecentes.length > 0 && !busca) {
      const todos = await db.listarClientes({})
      const mapa = new Map(todos.map((c) => [c.id, c]))
      setRecentes(idsRecentes.map((id) => mapa.get(id)).filter(Boolean))
    } else {
      setRecentes([])
    }
  }, [busca, status])

  useEffect(() => { carregar() }, [carregar])

  async function aoCadastrar(dados) {
    setSalvando(true)
    try {
      const cliente = await db.criarCliente(dados)
      notificar('Cliente cadastrado com sucesso.', 'sucesso')
      setModalNovo(false)
      carregar()
      navegar(`/clientes/${cliente.id}`)
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div>
      <div className="cd-pagina__cabecalho d-flex justify-content-between align-items-start">
        <div>
          <h1>Clientes</h1>
          <p className="cd-pagina__subtitulo">{clientes.length} cliente(s) cadastrado(s)</p>
        </div>
        <button className="btn btn-cd-primario" onClick={() => setModalNovo(true)}>
          <i className="bi bi-plus-lg me-1" /> Novo cliente
        </button>
      </div>

      <div className="d-flex gap-2 mb-3">
        <div style={{ flex: 1 }}>
          <div className="input-group">
            <span className="input-group-text bg-white"><i className="bi bi-search" /></span>
            <input
              type="text" className="form-control" placeholder="Buscar por nome ou CPF/CNPJ..."
              value={busca} onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
        <select className="form-select" style={{ maxWidth: 160 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="todos">Todos</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
        </select>
      </div>

      {recentes.length > 0 && (
        <div className="mb-3">
          <div className="texto-suave mb-1" style={{ fontSize: 12, fontWeight: 600 }}>
            <i className="bi bi-clock-history me-1" /> Recentes
          </div>
          <div className="d-flex gap-2 flex-wrap">
            {recentes.map((c) => (
              <button
                key={c.id}
                type="button"
                className="btn btn-sm btn-cd-secundario"
                onClick={() => navegar(`/clientes/${c.id}`)}
              >
                {c.nome}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="cd-card">
        {carregando ? (
          <div className="cd-vazio">Carregando...</div>
        ) : clientes.length === 0 ? (
          <div className="cd-vazio">Nenhum cliente encontrado.</div>
        ) : (
          <div>
            {clientes.map((c) => (
              <div
                key={c.id}
                onClick={() => navegar(`/clientes/${c.id}`)}
                style={{ padding: '13px 20px', borderBottom: '1px solid var(--cd-borda)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                className="cd-linha-cliente"
                onMouseOver={(e) => (e.currentTarget.style.background = 'var(--cd-azul-50)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>
                    {c.nome} {c.status === 'inativo' && <span className="cd-badge cd-badge--neutro ms-2">inativo</span>}
                  </div>
                  <div className="texto-suave" style={{ fontSize: 12.5 }}>
                    {[c.cpf, c.telefone].filter(Boolean).join(' · ') || 'Sem dados extras'}
                  </div>
                </div>
                <i className="bi bi-chevron-right texto-fraco" />
              </div>
            ))}
          </div>
        )}
      </div>

      {modalNovo && (
        <ClienteFormModal
          carregando={salvando}
          aoFechar={() => setModalNovo(false)}
          aoSalvar={aoCadastrar}
        />
      )}
    </div>
  )
}
