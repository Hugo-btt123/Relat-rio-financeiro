import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as db from '../../lib/db.js'
import { formatarMoeda, mascararCompetencia } from '../../lib/format.js'
import { useToast } from '../../context/ToastContext.jsx'
import StatusBadge from '../../components/common/StatusBadge.jsx'
import ConfirmModal from '../../components/common/ConfirmModal.jsx'

export default function NotinhaEditarPage() {
  const { id } = useParams()
  const navegar = useNavigate()
  const { notificar } = useToast()

  const [notinha, setNotinha] = useState(null)
  const [debitosDisponiveis, setDebitosDisponiveis] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [processando, setProcessando] = useState(false)

  const [competencia, setCompetencia] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [selecionadosParaAdicionar, setSelecionadosParaAdicionar] = useState(new Set())
  const [itemRemovendo, setItemRemovendo] = useState(null)
  const [confirmandoReabrir, setConfirmandoReabrir] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const n = await db.buscarNotinhaPorId(id)
    setNotinha(n)
    if (n) {
      setCompetencia(n.competencia)
      setObservacoes(n.observacoes || '')
      if (n.status === 'ativa') {
        const disponiveis = await db.listarDebitos({ clienteId: n.clienteId, status: 'aberto' })
        setDebitosDisponiveis(disponiveis)
      } else {
        setDebitosDisponiveis([])
      }
    }
    setSelecionadosParaAdicionar(new Set())
    setCarregando(false)
  }, [id])

  useEffect(() => { carregar() }, [carregar])

  if (carregando) return <div className="cd-vazio">Carregando...</div>
  if (!notinha) return <div className="cd-vazio">Notinha não encontrada. <a className="link-discreto" onClick={() => navegar('/notinhas')}>Voltar</a></div>

  async function aoReabrir() {
    setProcessando(true)
    try {
      await db.reabrirNotinha(id, 'Reaberta para edição.')
      notificar('Notinha reaberta — agora dá para editar os itens.', 'sucesso')
      setConfirmandoReabrir(false)
      carregar()
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setProcessando(false)
    }
  }

  async function aoSalvarCabecalho() {
    setProcessando(true)
    try {
      await db.atualizarNotinha(id, { competencia, observacoes })
      notificar('Notinha atualizada.', 'sucesso')
      carregar()
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setProcessando(false)
    }
  }

  function alternarSelecao(debitoId) {
    setSelecionadosParaAdicionar((atual) => {
      const novo = new Set(atual)
      if (novo.has(debitoId)) novo.delete(debitoId)
      else novo.add(debitoId)
      return novo
    })
  }

  async function aoAdicionar() {
    if (selecionadosParaAdicionar.size === 0) return
    setProcessando(true)
    try {
      await db.adicionarDebitosNaNotinha(id, [...selecionadosParaAdicionar])
      notificar('Débito(s) adicionado(s) à notinha.', 'sucesso')
      carregar()
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setProcessando(false)
    }
  }

  async function aoConfirmarRemocao() {
    setProcessando(true)
    try {
      await db.alterarStatusDebito(itemRemovendo.id, 'aberto', {})
      notificar('Débito removido da notinha — voltou para "em aberto".', 'sucesso')
      setItemRemovendo(null)
      carregar()
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setProcessando(false)
    }
  }

  const estaAtiva = notinha.status === 'ativa'

  return (
    <div>
      <a className="link-discreto" style={{ cursor: 'pointer', fontSize: 13 }} onClick={() => navegar(`/notinhas/${id}`)}>
        <i className="bi bi-arrow-left me-1" /> Voltar para a notinha {notinha.numero}
      </a>

      <div className="cd-pagina__cabecalho mt-2 d-flex justify-content-between align-items-start">
        <div>
          <h1>Editar notinha {notinha.numero}</h1>
          <p className="cd-pagina__subtitulo">{notinha.clienteNome}</p>
        </div>
        <StatusBadge status={notinha.statusExibicao} />
      </div>

      {notinha.status === 'estornada' && (
        <div className="alert alert-secondary" style={{ fontSize: 13 }}>
          Essa notinha está estornada e não pode ser editada. Se precisar, crie uma notinha nova.
        </div>
      )}

      {notinha.status === 'paga' && (
        <div className="cd-card mb-3" style={{ borderColor: 'var(--cd-dourado-300)' }}>
          <div className="cd-card__corpo d-flex justify-content-between align-items-center">
            <div style={{ fontSize: 13.5 }}>
              <i className="bi bi-info-circle me-1" />
              Essa notinha já está paga. Para adicionar, remover itens ou mudar a competência, reabra ela primeiro
              (o pagamento registrado será desfeito).
            </div>
            <button className="btn btn-cd-ouro" onClick={() => setConfirmandoReabrir(true)}>
              <i className="bi bi-arrow-clockwise me-1" /> Reabrir para editar
            </button>
          </div>
        </div>
      )}

      {notinha.status !== 'estornada' && (
        <div className="cd-card mb-3">
          <div className="cd-card__corpo">
            <div className="row g-3 align-items-end">
              <div className="col-md-4">
                <label className="cd-label">Competência</label>
                <input type="text" className="form-control" disabled={!estaAtiva} value={competencia} onChange={(e) => setCompetencia(mascararCompetencia(e.target.value))} />
              </div>
              <div className="col-md-6">
                <label className="cd-label">Observações</label>
                <input type="text" className="form-control" disabled={!estaAtiva} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
              </div>
              <div className="col-md-2">
                <button className="btn btn-cd-secundario w-100" disabled={!estaAtiva || processando} onClick={aoSalvarCabecalho}>
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {notinha.status !== 'estornada' && (
        <div className="cd-card mb-3">
          <div className="cd-card__corpo">
            <strong style={{ fontSize: 13.5 }}>Itens desta notinha</strong>
            <table className="cd-tabela mt-2">
              <thead>
                <tr><th>Descrição</th><th>Competência</th><th>Status</th><th className="text-end">Valor</th><th></th></tr>
              </thead>
              <tbody>
                {notinha.itens.map((item) => (
                  <tr key={item.id} className={item.status === 'cancelado' ? 'linha-cancelada' : ''}>
                    <td>{item.descricao}</td>
                    <td><span className="cd-chip-competencia">{item.competencia}</span></td>
                    <td><StatusBadge status={item.status} pixPendente={item.pixPendente} /></td>
                    <td className="text-end num">{formatarMoeda(item.valor)}</td>
                    <td className="text-end">
                      {estaAtiva && item.status === 'cobrado' && !item.pixPendente && (
                        <button className="btn btn-sm btn-cd-secundario" title="Remover da notinha (volta para em aberto)" onClick={() => setItemRemovendo(item)}>
                          <i className="bi bi-x-lg" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {estaAtiva && (
        <div className="cd-card">
          <div className="cd-card__corpo">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <strong style={{ fontSize: 13.5 }}>Adicionar débitos em aberto deste cliente</strong>
              {selecionadosParaAdicionar.size > 0 && (
                <button className="btn btn-sm btn-cd-primario" onClick={aoAdicionar} disabled={processando}>
                  <i className="bi bi-plus-lg me-1" /> Adicionar {selecionadosParaAdicionar.size} selecionado(s)
                </button>
              )}
            </div>
            {debitosDisponiveis.length === 0 ? (
              <div className="texto-fraco" style={{ fontSize: 13 }}>Não há outros débitos "em aberto" desse cliente para adicionar.</div>
            ) : (
              <table className="cd-tabela">
                <thead>
                  <tr><th></th><th>Descrição</th><th>Competência</th><th className="text-end">Valor</th></tr>
                </thead>
                <tbody>
                  {debitosDisponiveis.map((d) => (
                    <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => alternarSelecao(d.id)}>
                      <td>
                        <input type="checkbox" className="form-check-input" checked={selecionadosParaAdicionar.has(d.id)} onChange={() => alternarSelecao(d.id)} onClick={(e) => e.stopPropagation()} />
                      </td>
                      <td>{d.descricao}</td>
                      <td><span className="cd-chip-competencia">{d.competencia}</span></td>
                      <td className="text-end num">{formatarMoeda(d.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {confirmandoReabrir && (
        <ConfirmModal
          titulo="Reabrir notinha"
          mensagem="O pagamento registrado será desfeito e os itens voltam para 'cobrado', continuando vinculados a esta notinha, para você poder editar."
          textoConfirmar="Reabrir" carregando={processando}
          aoFechar={() => setConfirmandoReabrir(false)} aoConfirmar={aoReabrir}
        />
      )}

      {itemRemovendo && (
        <ConfirmModal
          titulo="Remover item da notinha"
          mensagem={`"${itemRemovendo.descricao}" (${formatarMoeda(itemRemovendo.valor)}) vai voltar para "em aberto" e sair desta notinha. O total dela será recalculado.`}
          textoConfirmar="Remover" variantePerigo carregando={processando}
          aoFechar={() => setItemRemovendo(null)} aoConfirmar={aoConfirmarRemocao}
        />
      )}
    </div>
  )
}
