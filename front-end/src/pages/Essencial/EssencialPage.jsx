import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as db from '../../lib/db.js'
import { competenciaAtual } from '../../lib/db.js'
import { formatarData, formatarMoeda, mascararCompetencia } from '../../lib/format.js'
import { useToast } from '../../context/ToastContext.jsx'
import ClienteAutocomplete from '../../components/common/ClienteAutocomplete.jsx'
import StatusBadge from '../../components/common/StatusBadge.jsx'
import MenuAcoes from '../../components/common/MenuAcoes.jsx'
import ConfirmModal from '../../components/common/ConfirmModal.jsx'
import ObservacaoConfirmModal from '../../components/common/ObservacaoConfirmModal.jsx'
import AlterarStatusDebitoModal from '../../components/common/AlterarStatusDebitoModal.jsx'
import PagamentoDinheiroModal from '../../components/common/PagamentoDinheiroModal.jsx'
import EditarDebitoModal from './EditarDebitoModal.jsx'
import LancamentoGrupoModal from './LancamentoGrupoModal.jsx'

// Formulário de lançamento rápido — começa "zerado" a cada envio.
function formularioVazio() {
  return { clienteId: null, propriedadeId: null, descricao: '', valor: '', competencia: competenciaAtual(), observacao: '', propriedades: [] }
}

export default function EssencialPage() {
  const { notificar } = useToast()
  const navegar = useNavigate()

  const [form, setForm] = useState(formularioVazio())
  const [lancando, setLancando] = useState(false)

  const [lancamentos, setLancamentos] = useState([])
  const [carregando, setCarregando] = useState(true)

  const [filtroBusca, setFiltroBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('aberto')
  const [filtroCompetencia, setFiltroCompetencia] = useState('')

  const [modalGrupo, setModalGrupo] = useState(false)
  const [debitoEditando, setDebitoEditando] = useState(null)
  const [debitoPagando, setDebitoPagando] = useState(null)
  const [debitoPix, setDebitoPix] = useState(null)
  const [debitoAlterandoStatus, setDebitoAlterandoStatus] = useState(null)
  const [debitoCancelando, setDebitoCancelando] = useState(null)
  const [processando, setProcessando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const lista = await db.listarDebitos({
      busca: filtroBusca,
      status: filtroStatus,
      competencia: filtroCompetencia,
    })
    setLancamentos(lista)
    setCarregando(false)
  }, [filtroBusca, filtroStatus, filtroCompetencia])

  useEffect(() => { carregar() }, [carregar])

  const total = lancamentos.reduce((s, d) => s + d.valor, 0)

  async function aoSelecionarClienteForm(cliente) {
    if (!cliente) {
      setForm((f) => ({ ...f, clienteId: null, propriedadeId: null, propriedades: [] }))
      return
    }
    const propriedades = await db.listarPropriedades(cliente.id)
    setForm((f) => ({ ...f, clienteId: cliente.id, propriedadeId: null, propriedades }))
  }

  async function aoLancarRapido(e) {
    e.preventDefault()
    setLancando(true)
    try {
      await db.criarDebito({
        clienteId: form.clienteId,
        propriedadeId: form.propriedadeId,
        descricao: form.descricao,
        valor: form.valor,
        competencia: form.competencia,
        observacao: form.observacao,
      })
      notificar('Débito lançado com sucesso.', 'sucesso')
      // Mantém cliente, propriedade e competência preenchidos — é muito
      // comum lançar vários débitos seguidos pro MESMO cliente/mês (ex.:
      // FGTS, INSS, Simples de uma vez). Só limpa o que muda a cada
      // lançamento (descrição, valor, observação). Isso também evita um
      // problema sério: se a competência voltasse sozinha pro mês atual a
      // cada lançamento, alguém digitando vários débitos atrasados de um
      // mês antigo podia, sem perceber, lançar um deles no mês errado.
      setForm((f) => ({ ...f, descricao: '', valor: '', observacao: '', propriedadeId: null }))
      carregar()
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setLancando(false)
    }
  }

  async function aoConfirmarPagamentoDinheiro(dados) {
    setProcessando(true)
    try {
      await db.marcarPagoDinheiro(debitoPagando.id, dados)
      notificar('Débito marcado como pago.', 'sucesso')
      setDebitoPagando(null)
      carregar()
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setProcessando(false)
    }
  }

  async function aoMarcarPix(obs) {
    setProcessando(true)
    try {
      await db.marcarPagoPix(debitoPix.id, obs)
      notificar('Pix registrado — aguardando conferência.', 'sucesso')
      setDebitoPix(null)
      carregar()
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setProcessando(false)
    }
  }

  async function aoAlterarStatus(dados) {
    setProcessando(true)
    try {
      await db.alterarStatusDebito(debitoAlterandoStatus.id, dados.alvo, dados)
      notificar('Status do débito atualizado.', 'sucesso')
      setDebitoAlterandoStatus(null)
      carregar()
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setProcessando(false)
    }
  }

  async function aoSalvarEdicao(dados) {
    setProcessando(true)
    try {
      await db.editarDebito(debitoEditando.id, dados)
      notificar('Débito atualizado.', 'sucesso')
      setDebitoEditando(null)
      carregar()
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setProcessando(false)
    }
  }

  async function aoConfirmarCancelamento() {
    setProcessando(true)
    try {
      await db.cancelarDebito(debitoCancelando.id)
      notificar('Débito cancelado.', 'sucesso')
      setDebitoCancelando(null)
      carregar()
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setProcessando(false)
    }
  }

  function acoesParaLinha(d) {
    const itens = []
    if (d.status === 'aberto') {
      itens.push({ rotulo: 'Editar', icone: 'bi-pencil', aoClicar: () => setDebitoEditando(d) })
      itens.push({
        rotulo: 'Adicionar à notinha', icone: 'bi-receipt',
        aoClicar: () => navegar(`/notinhas/nova?clienteId=${d.clienteId}&debitoId=${d.id}`),
      })
      itens.push({ rotulo: 'Marcar pago (dinheiro)', icone: 'bi-cash-coin', aoClicar: () => setDebitoPagando(d) })
      itens.push({ rotulo: 'Marcar pago (Pix)', icone: 'bi-phone', aoClicar: () => setDebitoPix(d) })
      itens.push({ separador: true })
      itens.push({ rotulo: 'Cancelar débito', icone: 'bi-x-circle', perigo: true, aoClicar: () => setDebitoCancelando(d) })
    } else if (d.status === 'cobrado') {
      if (d.notinhaId) {
        itens.push({ rotulo: 'Ver notinha', icone: 'bi-receipt', aoClicar: () => navegar(`/notinhas/${d.notinhaId}`) })
      } else if (d.pixPendente) {
        itens.push({ rotulo: 'Conferir Pix', icone: 'bi-phone', aoClicar: () => navegar('/conferir-pix') })
      }
      itens.push({ rotulo: 'Alterar status / estornar', icone: 'bi-arrow-repeat', aoClicar: () => setDebitoAlterandoStatus(d) })
    } else if (d.status === 'pago') {
      if (d.notinhaId) {
        itens.push({ rotulo: 'Ver notinha', icone: 'bi-receipt', aoClicar: () => navegar(`/notinhas/${d.notinhaId}`) })
      }
      itens.push({ rotulo: 'Alterar status / estornar', icone: 'bi-arrow-repeat', aoClicar: () => setDebitoAlterandoStatus(d) })
    }
    return itens
  }

  return (
    <div>
      <div className="cd-pagina__cabecalho">
        <h1>Essencial</h1>
        <p className="cd-pagina__subtitulo">O caderno — todos os lançamentos.</p>
      </div>

      {/* --- Lançamento rápido --- */}
      <div className="cd-card mb-3">
        <div className="cd-card__corpo">
          <form onSubmit={aoLancarRapido}>
            <div className="d-flex align-items-end gap-2 flex-wrap">
              <div style={{ flex: '1 1 220px' }}>
                <label className="cd-label">Cliente</label>
                <ClienteAutocomplete valorClienteId={form.clienteId} aoSelecionar={aoSelecionarClienteForm} />
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <label className="cd-label">Descrição</label>
                <input
                  type="text" className="form-control" placeholder="Ex.: FGTS, IRPF, Honorários..."
                  value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} required
                />
              </div>
              <div style={{ flex: '0 1 130px' }}>
                <label className="cd-label">Valor (R$)</label>
                <input
                  type="number" min="0" step="0.01" className="form-control num" placeholder="0,00"
                  value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} required
                />
              </div>
              <div style={{ flex: '0 1 130px' }}>
                <label className="cd-label">Competência</label>
                <input
                  type="text" className="form-control" placeholder="MM/AAAA"
                  value={form.competencia} onChange={(e) => setForm((f) => ({ ...f, competencia: mascararCompetencia(e.target.value) }))} required
                />
              </div>
              <div style={{ flex: '1 1 160px' }}>
                <label className="cd-label">Obs (opcional)</label>
                <input
                  type="text" className="form-control" placeholder="—"
                  value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
                />
              </div>
              <div>
                <button type="submit" className="btn btn-cd-primario" disabled={lancando}>
                  <i className="bi bi-plus-lg me-1" /> {lancando ? 'Lançando...' : 'Lançar'}
                </button>
              </div>
              <div>
                <button type="button" className="btn btn-cd-secundario" onClick={() => setModalGrupo(true)}>
                  <i className="bi bi-people me-1" /> Lançar em grupo
                </button>
              </div>
            </div>
            {form.propriedades.length > 0 && (
              <div className="mt-2" style={{ maxWidth: 260 }}>
                <select
                  className="form-select form-select-sm"
                  value={form.propriedadeId || ''}
                  onChange={(e) => setForm((f) => ({ ...f, propriedadeId: e.target.value || null }))}
                >
                  <option value="">— Sem propriedade —</option>
                  {form.propriedades.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="texto-fraco mt-2" style={{ fontSize: 11.5 }}>
              Dica: pressione <kbd style={{ fontSize: 10.5 }}>Enter</kbd> em qualquer campo para lançar.
            </div>
          </form>
        </div>
      </div>

      {/* --- Filtros --- */}
      <div className="d-flex gap-2 align-items-center mb-2 flex-wrap">
        <div style={{ flex: '1 1 260px' }}>
          <div className="input-group">
            <span className="input-group-text bg-white"><i className="bi bi-search" /></span>
            <input
              type="text" className="form-control" placeholder="Buscar descrição..."
              value={filtroBusca} onChange={(e) => setFiltroBusca(e.target.value)}
            />
          </div>
        </div>
        <select className="form-select" style={{ maxWidth: 170 }} value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
          <option value="todos">Todos os status</option>
          <option value="aberto">Em aberto</option>
          <option value="cobrado">Cobrado</option>
          <option value="pago">Pago</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <input
          type="text" className="form-control" style={{ maxWidth: 150 }} placeholder="Competência"
          value={filtroCompetencia} onChange={(e) => setFiltroCompetencia(mascararCompetencia(e.target.value))}
        />
        <div className="ms-auto text-end">
          <div style={{ fontSize: 12.5 }} className="texto-suave">{lancamentos.length} lançamento(s)</div>
          <div className="num" style={{ fontSize: 18, fontWeight: 700, color: 'var(--cd-azul-950)' }}>{formatarMoeda(total)}</div>
        </div>
      </div>

      {/* --- Tabela --- */}
      <div className="cd-card">
        {carregando ? (
          <div className="cd-vazio">Carregando...</div>
        ) : lancamentos.length === 0 ? (
          <div className="cd-vazio">Nenhum lançamento encontrado com esses filtros.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cd-tabela">
              <thead>
                <tr>
                  <th>Criado</th>
                  <th>Descrição</th>
                  <th>Cliente</th>
                  <th>Propriedade</th>
                  <th>Competência</th>
                  <th className="text-end">Valor</th>
                  <th>Status</th>
                  <th>Notinha</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lancamentos.map((d) => (
                  <tr key={d.id} className={d.status === 'cancelado' ? 'linha-cancelada' : ''}>
                    <td className="texto-suave">{formatarData(d.criadoEm)}</td>
                    <td>
                      <strong>{d.descricao}</strong>
                      {d.observacao && <div className="texto-fraco" style={{ fontSize: 11.5 }}>{d.observacao}</div>}
                    </td>
                    <td>
                      <a className="link-discreto" onClick={() => navegar(`/clientes/${d.clienteId}`)} style={{ cursor: 'pointer' }}>
                        {d.clienteNome}
                      </a>
                    </td>
                    <td className="texto-suave">{d.propriedadeNome || '—'}</td>
                    <td><span className="cd-chip-competencia">{d.competencia}</span></td>
                    <td className="text-end num">{formatarMoeda(d.valor)}</td>
                    <td><StatusBadge status={d.status} pixPendente={d.pixPendente} /></td>
                    <td>
                      {d.notinhaId ? (
                        <a className="link-discreto" style={{ cursor: 'pointer' }} onClick={() => navegar(`/notinhas/${d.notinhaId}`)}>
                          ver notinha
                        </a>
                      ) : (
                        <span className="texto-fraco">—</span>
                      )}
                    </td>
                    <td className="text-end">
                      {acoesParaLinha(d).length > 0 && <MenuAcoes itens={acoesParaLinha(d)} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalGrupo && (
        <LancamentoGrupoModal
          competenciaPadrao={competenciaAtual()}
          aoFechar={() => setModalGrupo(false)}
          aoConcluir={(qtd) => {
            setModalGrupo(false)
            notificar(`${qtd} débito(s) lançado(s) com sucesso.`, 'sucesso')
            carregar()
          }}
        />
      )}

      {debitoEditando && (
        <EditarDebitoModal
          debito={debitoEditando}
          carregando={processando}
          aoFechar={() => setDebitoEditando(null)}
          aoSalvar={aoSalvarEdicao}
        />
      )}

      {debitoPagando && (
        <PagamentoDinheiroModal
          debito={debitoPagando}
          carregando={processando}
          aoFechar={() => setDebitoPagando(null)}
          aoConfirmar={aoConfirmarPagamentoDinheiro}
        />
      )}

      {debitoPix && (
        <ObservacaoConfirmModal
          titulo="Marcar pago via Pix"
          mensagem={`O débito "${debitoPix.descricao}" de ${debitoPix.clienteNome} (${formatarMoeda(debitoPix.valor)}) vai para "Conferir Pix", aguardando confirmação do extrato.`}
          textoConfirmar="Marcar como pago via Pix"
          carregando={processando}
          aoFechar={() => setDebitoPix(null)}
          aoConfirmar={aoMarcarPix}
        />
      )}

      {debitoAlterandoStatus && (
        <AlterarStatusDebitoModal
          debito={debitoAlterandoStatus}
          carregando={processando}
          aoFechar={() => setDebitoAlterandoStatus(null)}
          aoConfirmar={aoAlterarStatus}
        />
      )}

      {debitoCancelando && (
        <ConfirmModal
          titulo="Cancelar débito"
          mensagem={`Tem certeza que deseja cancelar o débito "${debitoCancelando.descricao}" de ${debitoCancelando.clienteNome}? Ele continuará visível no histórico, marcado como cancelado.${debitoCancelando.notinhaId ? ' Como ele está numa notinha, o total dela também será ajustado.' : ''}`}
          textoConfirmar="Cancelar débito"
          variantePerigo
          carregando={processando}
          aoFechar={() => setDebitoCancelando(null)}
          aoConfirmar={aoConfirmarCancelamento}
        />
      )}
    </div>
  )
}
