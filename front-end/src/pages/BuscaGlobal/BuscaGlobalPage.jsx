import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as db from '../../lib/db.js'
import { formatarMoeda } from '../../lib/format.js'
import StatusBadge from '../../components/common/StatusBadge.jsx'

export default function BuscaGlobalPage() {
  const navegar = useNavigate()
  const [texto, setTexto] = useState('')
  const [resultado, setResultado] = useState({ clientes: [], debitos: [], notinhas: [] })
  const [buscando, setBuscando] = useState(false)

  useEffect(() => {
    let cancelado = false
    if (!texto.trim()) {
      setResultado({ clientes: [], debitos: [], notinhas: [] })
      return
    }
    setBuscando(true)
    // pequeno "debounce" manual para não buscar a cada tecla
    const timer = setTimeout(async () => {
      const r = await db.buscaGlobal(texto)
      if (!cancelado) {
        setResultado(r)
        setBuscando(false)
      }
    }, 220)
    return () => { cancelado = true; clearTimeout(timer) }
  }, [texto])

  return (
    <div>
      <div className="cd-pagina__cabecalho">
        <h1>Busca global</h1>
        <p className="cd-pagina__subtitulo">Procure por cliente, CPF/CNPJ, descrição de débito, competência (ex.: 04/2026) ou número de notinha.</p>
      </div>

      <div className="input-group mb-3" style={{ maxWidth: 520 }}>
        <span className="input-group-text bg-white"><i className="bi bi-search" /></span>
        <input
          type="text" className="form-control form-control-lg" placeholder="Digite para buscar..."
          value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus
        />
      </div>

      {texto.trim() && (
        <div className="row g-3">
          <div className="col-md-4">
            <div className="cd-card">
              <div className="cd-card__corpo">
                <strong style={{ fontSize: 13.5 }}>Clientes ({resultado.clientes.length})</strong>
                <div className="mt-2 d-flex flex-column gap-2">
                  {resultado.clientes.length === 0 && <span className="texto-fraco" style={{ fontSize: 13 }}>Nenhum.</span>}
                  {resultado.clientes.map((c) => (
                    <div key={c.id} style={{ cursor: 'pointer', fontSize: 13.5 }} onClick={() => navegar(`/clientes/${c.id}`)}>
                      <strong>{c.nome}</strong>
                      {c.cpf && <div className="texto-fraco" style={{ fontSize: 12 }}>{c.cpf}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="col-md-4">
            <div className="cd-card">
              <div className="cd-card__corpo">
                <strong style={{ fontSize: 13.5 }}>Débitos ({resultado.debitos.length})</strong>
                <div className="mt-2 d-flex flex-column gap-2">
                  {resultado.debitos.length === 0 && <span className="texto-fraco" style={{ fontSize: 13 }}>Nenhum.</span>}
                  {resultado.debitos.map((d) => (
                    <div
                      key={d.id}
                      style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}
                      onClick={() => navegar(d.notinhaId ? `/notinhas/${d.notinhaId}` : `/clientes/${d.clienteId}`)}
                    >
                      <div>
                        <strong>{d.descricao}</strong>
                        <div className="texto-fraco" style={{ fontSize: 12 }}>{d.clienteNome} · {d.competencia}</div>
                      </div>
                      <div className="text-end">
                        <div className="num">{formatarMoeda(d.valor)}</div>
                        <StatusBadge status={d.status} pixPendente={d.pixPendente} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="col-md-4">
            <div className="cd-card">
              <div className="cd-card__corpo">
                <strong style={{ fontSize: 13.5 }}>Notinhas ({resultado.notinhas.length})</strong>
                <div className="mt-2 d-flex flex-column gap-2">
                  {resultado.notinhas.length === 0 && <span className="texto-fraco" style={{ fontSize: 13 }}>Nenhuma.</span>}
                  {resultado.notinhas.map((n) => (
                    <div key={n.id} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }} onClick={() => navegar(`/notinhas/${n.id}`)}>
                      <div>
                        <strong>{n.numero}</strong>
                        <div className="texto-fraco" style={{ fontSize: 12 }}>{n.clienteNome} · {n.competencia}</div>
                      </div>
                      <div className="text-end">
                        <div className="num">{formatarMoeda(n.total)}</div>
                        <StatusBadge status={n.statusExibicao} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {!texto.trim() && (
        <div className="cd-vazio">Comece a digitar para pesquisar em todo o sistema.</div>
      )}
    </div>
  )
}
