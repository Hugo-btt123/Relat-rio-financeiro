import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as db from '../../lib/db.js'
import { formatarData, formatarMoeda, mascararCompetencia } from '../../lib/format.js'
import StatusBadge from '../../components/common/StatusBadge.jsx'

export default function NotinhasPage() {
  const navegar = useNavigate()
  const [notinhas, setNotinhas] = useState([])
  const [busca, setBusca] = useState('')
  const [competencia, setCompetencia] = useState('')
  const [status, setStatus] = useState('todas')
  const [carregando, setCarregando] = useState(true)
  const [selecionadas, setSelecionadas] = useState(new Set())

  const carregar = useCallback(async () => {
    setCarregando(true)
    const lista = await db.listarNotinhas({ busca, competencia, status })
    setNotinhas(lista)
    setCarregando(false)
  }, [busca, competencia, status])

  useEffect(() => { carregar() }, [carregar])

  // Ao trocar o filtro, limpa a seleção — evita imprimir "agrupado" uma
  // notinha que nem está mais visível na lista atual.
  useEffect(() => { setSelecionadas(new Set()) }, [busca, competencia, status])

  function alternarSelecao(idNotinha) {
    setSelecionadas((atual) => {
      const novo = new Set(atual)
      if (novo.has(idNotinha)) novo.delete(idNotinha)
      else novo.add(idNotinha)
      return novo
    })
  }

  function aoAgruparEImprimir() {
    navegar(`/notinhas/agrupado?ids=${[...selecionadas].join(',')}`)
  }

  return (
    <div>
      <div className="cd-pagina__cabecalho d-flex justify-content-between align-items-start">
        <div>
          <h1>Notinhas</h1>
          <p className="cd-pagina__subtitulo">
            Faturas mensais agrupando débitos cobrados. Marque duas ou mais para juntar num só resumo de impressão.
          </p>
        </div>
        <button className="btn btn-cd-primario" onClick={() => navegar('/notinhas/nova')}>
          <i className="bi bi-plus-lg me-1" /> Nova notinha
        </button>
      </div>

      <div className="d-flex gap-2 mb-3">
        <div style={{ flex: 1 }}>
          <div className="input-group">
            <span className="input-group-text bg-white"><i className="bi bi-search" /></span>
            <input type="text" className="form-control" placeholder="Buscar por cliente..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>
        <input type="text" className="form-control" style={{ maxWidth: 150 }} placeholder="Competência (ex: 04/2026)" value={competencia} onChange={(e) => setCompetencia(mascararCompetencia(e.target.value))} />
        <select className="form-select" style={{ maxWidth: 160 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="todas">Todos os status</option>
          <option value="ativa">Ativa</option>
          <option value="paga">Paga</option>
          <option value="estornada">Estornada</option>
        </select>
      </div>

      {selecionadas.size > 0 && (
        <div className="cd-card mb-3" style={{ borderColor: 'var(--cd-dourado-300)' }}>
          <div className="cd-card__corpo d-flex justify-content-between align-items-center" style={{ padding: '10px 16px' }}>
            <span style={{ fontSize: 13.5 }}>
              <i className="bi bi-check2-square me-1" /> <strong>{selecionadas.size}</strong> notinha(s) selecionada(s)
            </span>
            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-cd-secundario" onClick={() => setSelecionadas(new Set())}>Limpar seleção</button>
              <button className="btn btn-sm btn-cd-ouro" onClick={aoAgruparEImprimir} disabled={selecionadas.size < 2}>
                <i className="bi bi-printer me-1" /> Agrupar e imprimir
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="cd-card">
        {carregando ? (
          <div className="cd-vazio">Carregando...</div>
        ) : notinhas.length === 0 ? (
          <div className="cd-vazio">Nenhuma notinha encontrada.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cd-tabela">
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th>#</th><th>Criada</th><th>Cliente</th><th>Competência</th>
                  <th>Itens</th><th className="text-end">Total</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {notinhas.map((n) => (
                  <tr key={n.id} style={{ cursor: 'pointer' }} onClick={() => navegar(`/notinhas/${n.id}`)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="form-check-input" checked={selecionadas.has(n.id)} onChange={() => alternarSelecao(n.id)} />
                    </td>
                    <td><i className="bi bi-receipt me-1 texto-fraco" />{n.numero}</td>
                    <td className="texto-suave">{formatarData(n.criadoEm)}</td>
                    <td>{n.clienteNome}</td>
                    <td><span className="cd-chip-competencia">{n.competencia}</span></td>
                    <td>{n.itens.length}</td>
                    <td className="text-end num">{formatarMoeda(n.total)}</td>
                    <td><StatusBadge status={n.statusExibicao} /></td>
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
