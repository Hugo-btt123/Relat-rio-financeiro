import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as db from '../../lib/db.js'
import { competenciaAtual } from '../../lib/db.js'
import { formatarMoeda, mascararCompetencia } from '../../lib/format.js'
import { useToast } from '../../context/ToastContext.jsx'
import { useAutenticacao } from '../../context/AuthContext.jsx'
import ClienteAutocomplete from '../../components/common/ClienteAutocomplete.jsx'

export default function NovaNotinhaPage() {
  const navegar = useNavigate()
  const [params] = useSearchParams()
  const { notificar } = useToast()
  const { usuario } = useAutenticacao()
  const ehAdministrador = usuario?.papel === 'administrador'

  const [clienteId, setClienteId] = useState(params.get('clienteId') || null)
  const [cliente, setCliente] = useState(null)
  const [competencia, setCompetencia] = useState(competenciaAtual())
  const [observacoes, setObservacoes] = useState('')
  const [debitosAbertos, setDebitosAbertos] = useState([])
  const [selecionados, setSelecionados] = useState(new Set())
  const [incluirHonorario, setIncluirHonorario] = useState(true)
  const [carregando, setCarregando] = useState(false)
  const [gerando, setGerando] = useState(false)

  const carregarDebitos = useCallback(async (id) => {
    if (!id) {
      setDebitosAbertos([])
      setSelecionados(new Set())
      setCliente(null)
      return
    }
    setCarregando(true)
    const [lista, clienteCarregado] = await Promise.all([
      db.listarDebitos({ clienteId: id, status: 'aberto' }),
      db.buscarClientePorId(id),
    ])
    setDebitosAbertos(lista)
    setCliente(clienteCarregado)
    setIncluirHonorario(true) // volta a marcar por padrão a cada troca de cliente
    // Se veio de um débito específico (link "adicionar à notinha"), já
    // marca ele como selecionado; senão marca todos por padrão.
    const debitoPreSelecionado = params.get('debitoId')
    if (debitoPreSelecionado && lista.some((d) => d.id === debitoPreSelecionado)) {
      setSelecionados(new Set([debitoPreSelecionado]))
    } else {
      setSelecionados(new Set(lista.map((d) => d.id)))
    }
    setCarregando(false)
  }, [params])

  useEffect(() => { carregarDebitos(clienteId) }, [clienteId, carregarDebitos])

  function alternarSelecao(id) {
    setSelecionados((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  function marcarTodos() { setSelecionados(new Set(debitosAbertos.map((d) => d.id))) }
  function desmarcarTodos() { setSelecionados(new Set()) }

  const valorHonorario = Number(cliente?.honorarioEscritorio) || 0
  const totalSelecionado = debitosAbertos
    .filter((d) => selecionados.has(d.id))
    .reduce((s, d) => s + d.valor, 0) + (incluirHonorario ? valorHonorario : 0)

  async function aoGerar() {
    setGerando(true)
    try {
      const notinha = await db.criarNotinha({
        clienteId, competencia, observacoes, debitoIds: [...selecionados],
        // Funcionário não vê nem controla essa opção na tela, mas o valor
        // continua entrando por padrão (regra combinada: só o admin
        // enxerga/mexe no honorário, mas ele sempre entra a menos que
        // alguém desmarque — e só o admin tem como desmarcar).
        incluirHonorario: ehAdministrador ? incluirHonorario : true,
      })
      notificar('Notinha gerada com sucesso.', 'sucesso')
      navegar(`/notinhas/${notinha.id}`)
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setGerando(false)
    }
  }

  return (
    <div>
      <a className="link-discreto" style={{ cursor: 'pointer', fontSize: 13 }} onClick={() => navegar('/notinhas')}>
        <i className="bi bi-arrow-left me-1" /> Notinhas
      </a>

      <div className="cd-pagina__cabecalho mt-2">
        <h1>Nova notinha</h1>
        <p className="cd-pagina__subtitulo">Agrupar débitos em aberto de um cliente em uma única fatura.</p>
      </div>

      <div className="cd-card mb-3">
        <div className="cd-card__corpo">
          <div className="row g-3">
            <div className="col-md-7">
              <label className="cd-label">Cliente</label>
              <ClienteAutocomplete valorClienteId={clienteId} aoSelecionar={(c) => setClienteId(c ? c.id : null)} />
            </div>
            <div className="col-md-5">
              <label className="cd-label">Competência da notinha</label>
              <input type="text" className="form-control" placeholder="MM/AAAA" value={competencia} onChange={(e) => setCompetencia(mascararCompetencia(e.target.value))} />
            </div>
          </div>
        </div>
      </div>

      {!clienteId ? (
        <div className="cd-vazio">Selecione um cliente para ver os débitos em aberto.</div>
      ) : carregando ? (
        <div className="cd-vazio">Carregando débitos...</div>
      ) : (
        <div className="cd-card mb-3">
          <div className="cd-card__corpo">
            {debitosAbertos.length === 0 ? (
              <div className="texto-fraco" style={{ fontSize: 13 }}>Este cliente não tem débitos "em aberto" no momento.</div>
            ) : (
              <>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <strong style={{ fontSize: 13.5 }}>Débitos em aberto</strong>
                  <button type="button" className="link-discreto" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={selecionados.size === debitosAbertos.length ? desmarcarTodos : marcarTodos}>
                    {selecionados.size === debitosAbertos.length ? 'Desmarcar todos' : 'Marcar todos'}
                  </button>
                </div>
                <table className="cd-tabela">
                  <thead>
                    <tr><th></th><th>Descrição</th><th>Propriedade</th><th>Competência</th><th className="text-end">Valor</th></tr>
                  </thead>
                  <tbody>
                    {debitosAbertos.map((d) => (
                      <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => alternarSelecao(d.id)}>
                        <td>
                          <input type="checkbox" className="form-check-input" checked={selecionados.has(d.id)} onChange={() => alternarSelecao(d.id)} onClick={(e) => e.stopPropagation()} />
                        </td>
                        <td>{d.descricao}</td>
                        <td className="texto-suave">{d.propriedadeNome || '—'}</td>
                        <td><span className="cd-chip-competencia">{d.competencia}</span></td>
                        <td className="text-end num">{formatarMoeda(d.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {ehAdministrador && valorHonorario > 0 && (
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--cd-borda)' }}>
                <label className="d-flex align-items-center gap-2" style={{ fontSize: 13.5, cursor: 'pointer' }}>
                  <input type="checkbox" className="form-check-input" checked={incluirHonorario} onChange={(e) => setIncluirHonorario(e.target.checked)} />
                  <i className="bi bi-lock texto-fraco" style={{ fontSize: 11 }} />
                  Incluir honorário do Escritório ({formatarMoeda(valorHonorario)})
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="cd-card mb-3">
        <div className="cd-card__corpo">
          <label className="cd-label">Observações (opcional)</label>
          <textarea className="form-control" rows={2} placeholder="Anotações livres sobre essa notinha..." value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </div>
      </div>

      <div className="d-flex justify-content-between align-items-center">
        <div>
          <div className="texto-suave" style={{ fontSize: 12.5 }}>{selecionados.size} débito(s) selecionado(s)</div>
          <div className="num" style={{ fontSize: 22, fontWeight: 700, color: 'var(--cd-azul-950)' }}>{formatarMoeda(totalSelecionado)}</div>
        </div>
        <button className="btn btn-cd-primario" disabled={!clienteId || (selecionados.size === 0 && !(incluirHonorario && valorHonorario > 0)) || gerando} onClick={aoGerar}>
          <i className="bi bi-receipt me-1" /> {gerando ? 'Gerando...' : 'Gerar notinha'}
        </button>
      </div>
    </div>
  )
}
