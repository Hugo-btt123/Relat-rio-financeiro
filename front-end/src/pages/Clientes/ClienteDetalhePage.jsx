import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as db from '../../lib/db.js'
import { competenciaAtual } from '../../lib/db.js'
import { formatarDataHora, formatarMoeda, mascararCompetencia } from '../../lib/format.js'
import { registrarAcessoCliente } from '../../lib/recentes.js'
import { useToast } from '../../context/ToastContext.jsx'
import StatusBadge from '../../components/common/StatusBadge.jsx'
import MenuAcoes from '../../components/common/MenuAcoes.jsx'
import Modal from '../../components/common/Modal.jsx'
import ConfirmModal from '../../components/common/ConfirmModal.jsx'
import ObservacaoConfirmModal from '../../components/common/ObservacaoConfirmModal.jsx'
import AlterarStatusDebitoModal from '../../components/common/AlterarStatusDebitoModal.jsx'
import PagamentoDinheiroModal from '../../components/common/PagamentoDinheiroModal.jsx'
import ClienteFormModal from './ClienteFormModal.jsx'
import EditarDebitoModal from '../Essencial/EditarDebitoModal.jsx'

const ABAS = [
  { chave: 'aberto', rotulo: 'Em aberto' },
  { chave: 'cobrado', rotulo: 'Cobrado' },
  { chave: 'pago', rotulo: 'Pago' },
  { chave: 'historico', rotulo: 'Histórico' },
]

// Ícone + cor de cada tipo de evento da linha do tempo do cliente.
function iconeParaAcao(acao) {
  if (acao.includes('Pago') || acao.includes('Paga') || acao.includes('Quitada') || acao.includes('conferido')) return { icone: 'bi-check-circle-fill', classe: 'pago' }
  if (acao.includes('Cancelado') || acao.includes('Estornada')) return { icone: 'bi-x-circle-fill', classe: 'cancelado' }
  if (acao.includes('Pix')) return { icone: 'bi-phone', classe: 'pix' }
  if (acao.includes('Gerada')) return { icone: 'bi-receipt', classe: '' }
  return { icone: 'bi-circle-fill', classe: '' }
}

export default function ClienteDetalhePage() {
  const { id } = useParams()
  const navegar = useNavigate()
  const { notificar } = useToast()

  const [cliente, setCliente] = useState(null)
  const [propriedades, setPropriedades] = useState([]) // todas (para a lista/gerenciamento)
  const [propriedadesAtivas, setPropriedadesAtivas] = useState([]) // só ativas (para os seletores de lançamento)
  const [debitosPorAba, setDebitosPorAba] = useState({ aberto: [], cobrado: [], pago: [] })
  const [historico, setHistorico] = useState([])
  const [abaAtiva, setAbaAtiva] = useState('aberto')
  const [carregando, setCarregando] = useState(true)

  const [form, setForm] = useState({ descricao: '', valor: '', competencia: competenciaAtual(), observacao: '', propriedadeId: null })
  const [lancando, setLancando] = useState(false)
  const [modalPropriedade, setModalPropriedade] = useState(false)
  const [propriedadeEditando, setPropriedadeEditando] = useState(null)
  const [modalEditarCliente, setModalEditarCliente] = useState(false)
  const [debitoEditando, setDebitoEditando] = useState(null)
  const [debitoPagando, setDebitoPagando] = useState(null)
  const [debitoPix, setDebitoPix] = useState(null)
  const [debitoAlterandoStatus, setDebitoAlterandoStatus] = useState(null)
  const [debitoCancelando, setDebitoCancelando] = useState(null)
  const [processando, setProcessando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [c, props, propsAtivas, aberto, cobrado, pago, hist] = await Promise.all([
      db.buscarClientePorId(id),
      db.listarPropriedades(id, { apenasAtivas: false }),
      db.listarPropriedades(id, { apenasAtivas: true }),
      db.listarDebitos({ clienteId: id, status: 'aberto' }),
      db.listarDebitos({ clienteId: id, status: 'cobrado' }),
      db.listarDebitos({ clienteId: id, status: 'pago' }),
      db.listarHistoricoDoCliente(id),
    ])
    setCliente(c)
    setPropriedades(props)
    setPropriedadesAtivas(propsAtivas)
    setDebitosPorAba({ aberto, cobrado, pago })
    setHistorico(hist)
    setCarregando(false)
    if (c) registrarAcessoCliente(c.id)
  }, [id])

  useEffect(() => { carregar() }, [carregar])

  if (!carregando && !cliente) {
    return <div className="cd-vazio">Cliente não encontrado. <a className="link-discreto" onClick={() => navegar('/clientes')}>Voltar para clientes</a></div>
  }

  const emAberto = debitosPorAba.aberto.reduce((s, d) => s + d.valor, 0)

  async function aoLancar(e) {
    e.preventDefault()
    setLancando(true)
    try {
      await db.criarDebito({
        clienteId: id, propriedadeId: form.propriedadeId, descricao: form.descricao,
        valor: form.valor, competencia: form.competencia, observacao: form.observacao,
      })
      notificar('Débito lançado.', 'sucesso')
      setForm({ descricao: '', valor: '', competencia: form.competencia, observacao: '', propriedadeId: null })
      carregar()
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setLancando(false)
    }
  }

  async function aoSalvarEdicaoCliente(dados) {
    setProcessando(true)
    try {
      await db.atualizarCliente(id, dados)
      notificar('Cliente atualizado.', 'sucesso')
      setModalEditarCliente(false)
      carregar()
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setProcessando(false)
    }
  }

  async function aoSalvarEdicaoDebito(dados) {
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

  async function aoConfirmarPagamento(dados) {
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
      itens.push({ rotulo: 'Adicionar à notinha', icone: 'bi-receipt', aoClicar: () => navegar(`/notinhas/nova?clienteId=${id}&debitoId=${d.id}`) })
      itens.push({ rotulo: 'Marcar pago (dinheiro)', icone: 'bi-cash-coin', aoClicar: () => setDebitoPagando(d) })
      itens.push({ rotulo: 'Marcar pago (Pix)', icone: 'bi-phone', aoClicar: () => setDebitoPix(d) })
      itens.push({ separador: true })
      itens.push({ rotulo: 'Cancelar débito', icone: 'bi-x-circle', perigo: true, aoClicar: () => setDebitoCancelando(d) })
    } else if (d.status === 'cobrado' || d.status === 'pago') {
      if (d.notinhaId) {
        itens.push({ rotulo: 'Ver notinha', icone: 'bi-receipt', aoClicar: () => navegar(`/notinhas/${d.notinhaId}`) })
      } else if (d.pixPendente) {
        itens.push({ rotulo: 'Conferir Pix', icone: 'bi-phone', aoClicar: () => navegar('/conferir-pix') })
      }
      itens.push({ rotulo: 'Alterar status / estornar', icone: 'bi-arrow-repeat', aoClicar: () => setDebitoAlterandoStatus(d) })
    }
    return itens
  }

  function TabelaDebitos({ lista }) {
    if (lista.length === 0) return <div className="cd-vazio">Nenhum débito nessa situação.</div>
    return (
      <div style={{ overflowX: 'auto' }}>
        <table className="cd-tabela">
          <thead>
            <tr>
              <th>Criado</th><th>Descrição</th><th>Propriedade</th><th>Competência</th>
              <th className="text-end">Valor</th><th>Status</th><th>Notinha</th><th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((d) => (
              <tr key={d.id}>
                <td className="texto-suave">{formatarDataHora(d.criadoEm).split(' ')[0]}</td>
                <td>
                  <strong>{d.descricao}</strong>
                  {d.observacao && <div className="texto-fraco" style={{ fontSize: 11.5 }}>{d.observacao}</div>}
                </td>
                <td className="texto-suave">{d.propriedadeNome || '—'}</td>
                <td><span className="cd-chip-competencia">{d.competencia}</span></td>
                <td className="text-end num">{formatarMoeda(d.valor)}</td>
                <td><StatusBadge status={d.status} pixPendente={d.pixPendente} /></td>
                <td>
                  {d.notinhaId ? (
                    <a className="link-discreto" style={{ cursor: 'pointer' }} onClick={() => navegar(`/notinhas/${d.notinhaId}`)}>ver notinha</a>
                  ) : <span className="texto-fraco">—</span>}
                </td>
                <td className="text-end">{acoesParaLinha(d).length > 0 && <MenuAcoes itens={acoesParaLinha(d)} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div>
      <a className="link-discreto" style={{ cursor: 'pointer', fontSize: 13 }} onClick={() => navegar('/clientes')}>
        <i className="bi bi-arrow-left me-1" /> Clientes
      </a>

      {carregando ? (
        <div className="cd-vazio">Carregando...</div>
      ) : (
        <>
          <div className="d-flex justify-content-between align-items-start mt-2 mb-3">
            <div>
              <h1>{cliente.nome}</h1>
              <div className="d-flex align-items-center gap-3 mt-1" style={{ fontSize: 13 }}>
                {cliente.cpf && <span className="texto-suave"><i className="bi bi-card-text me-1" />{cliente.cpf}</span>}
                {cliente.telefone && <span className="texto-suave"><i className="bi bi-telephone me-1" />{cliente.telefone}</span>}
                <span>Em aberto: <strong className="num" style={{ color: 'var(--cd-laranja)' }}>{formatarMoeda(emAberto)}</strong></span>
              </div>
            </div>
            <button className="btn btn-cd-secundario" onClick={() => setModalEditarCliente(true)}>
              <i className="bi bi-pencil me-1" /> Editar
            </button>
          </div>

          {/* --- Lançamento rápido para este cliente --- */}
          <div className="cd-card mb-3">
            <div className="cd-card__corpo">
              <form onSubmit={aoLancar} className="d-flex align-items-end gap-2 flex-wrap">
                <div style={{ flex: '1 1 200px' }}>
                  <label className="cd-label">Descrição</label>
                  <input type="text" className="form-control" placeholder="Ex.: FGTS, IRPF, Honorários..." value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} required />
                </div>
                <div style={{ flex: '0 1 130px' }}>
                  <label className="cd-label">Valor (R$)</label>
                  <input type="number" min="0" step="0.01" className="form-control num" placeholder="0,00" value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} required />
                </div>
                <div style={{ flex: '0 1 130px' }}>
                  <label className="cd-label">Competência</label>
                  <input type="text" className="form-control" placeholder="MM/AAAA" value={form.competencia} onChange={(e) => setForm((f) => ({ ...f, competencia: mascararCompetencia(e.target.value) }))} required />
                </div>
                {propriedadesAtivas.length > 0 && (
                  <div style={{ flex: '0 1 170px' }}>
                    <label className="cd-label">Propriedade</label>
                    <select className="form-select" value={form.propriedadeId || ''} onChange={(e) => setForm((f) => ({ ...f, propriedadeId: e.target.value || null }))}>
                      <option value="">— Sem propriedade —</option>
                      {propriedadesAtivas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </div>
                )}
                <div style={{ flex: '1 1 160px' }}>
                  <label className="cd-label">Obs (opcional)</label>
                  <input type="text" className="form-control" value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} />
                </div>
                <button type="submit" className="btn btn-cd-primario" disabled={lancando}>
                  <i className="bi bi-plus-lg me-1" /> {lancando ? 'Lançando...' : 'Lançar'}
                </button>
              </form>
            </div>
          </div>

          {/* --- Propriedades / filiais --- */}
          <div className="cd-card mb-3">
            <div className="cd-card__corpo">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <strong style={{ fontSize: 13.5 }}><i className="bi bi-building me-1" /> Propriedades / Filiais</strong>
                <button className="btn btn-sm btn-cd-secundario" onClick={() => setModalPropriedade(true)}>
                  <i className="bi bi-plus-lg me-1" /> Adicionar
                </button>
              </div>
              {propriedades.length === 0 ? (
                <div className="texto-fraco" style={{ fontSize: 13 }}>Nenhuma propriedade cadastrada.</div>
              ) : (
                <div className="d-flex flex-column gap-1">
                  {propriedades.map((p) => (
                    <div key={p.id} className="d-flex justify-content-between align-items-center" style={{ fontSize: 13.5, padding: '4px 0' }}>
                      <div>
                        <strong className={p.status === 'inativo' ? 'texto-fraco' : ''}>{p.nome}</strong>
                        {p.documento && <span className="texto-fraco"> — {p.documento}</span>}
                        {p.status === 'inativo' && <span className="cd-badge cd-badge--neutro ms-2">inativa</span>}
                      </div>
                      <button className="btn btn-sm btn-cd-secundario" onClick={() => setPropriedadeEditando(p)}>
                        <i className="bi bi-pencil" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* --- Abas --- */}
          <div className="d-flex gap-1 mb-2" style={{ borderBottom: '1px solid var(--cd-borda)' }}>
            {ABAS.map((aba) => (
              <button
                key={aba.chave}
                className="btn btn-sm"
                style={{
                  border: 'none', borderRadius: 0, fontWeight: 600, fontSize: 13,
                  borderBottom: abaAtiva === aba.chave ? '2px solid var(--cd-dourado-500)' : '2px solid transparent',
                  color: abaAtiva === aba.chave ? 'var(--cd-azul-950)' : 'var(--cd-texto-suave)',
                  background: 'none', padding: '8px 12px',
                }}
                onClick={() => setAbaAtiva(aba.chave)}
              >
                {aba.rotulo} {aba.chave !== 'historico' && `(${debitosPorAba[aba.chave].length})`}
              </button>
            ))}
          </div>

          <div className="cd-card">
            <div className="cd-card__corpo">
              {abaAtiva === 'historico' ? (
                historico.length === 0 ? (
                  <div className="cd-vazio">Nenhum evento registrado ainda.</div>
                ) : (
                  <div className="cd-linha-tempo">
                    {historico.map((h) => {
                      const { icone, classe } = iconeParaAcao(h.acao)
                      return (
                        <div key={h.id} className={`cd-linha-tempo__item ${classe}`}>
                          <div className="cd-linha-tempo__ponto" />
                          <div style={{ fontSize: 13.5 }}>
                            <strong>{h.acao}</strong>
                            <span className="texto-suave"> · {h.entidade}</span>
                          </div>
                          {h.detalhes && <div className="texto-suave" style={{ fontSize: 12.5 }}>{h.detalhes}</div>}
                          <div className="texto-fraco" style={{ fontSize: 11.5 }}>{formatarDataHora(h.quando)} · por {h.operador}</div>
                        </div>
                      )
                    })}
                  </div>
                )
              ) : (
                <TabelaDebitos lista={debitosPorAba[abaAtiva]} />
              )}
            </div>
          </div>
        </>
      )}

      {modalEditarCliente && (
        <ClienteFormModal clienteExistente={cliente} carregando={processando} aoFechar={() => setModalEditarCliente(false)} aoSalvar={aoSalvarEdicaoCliente} />
      )}

      {modalPropriedade && (
        <ModalPropriedade
          aoFechar={() => setModalPropriedade(false)}
          aoSalvar={async (dados) => {
            try {
              await db.criarPropriedade(id, dados)
              notificar('Propriedade adicionada.', 'sucesso')
              setModalPropriedade(false)
              carregar()
            } catch (erro) {
              notificar(erro.message, 'erro')
            }
          }}
        />
      )}

      {debitoEditando && (
        <EditarDebitoModal debito={debitoEditando} carregando={processando} aoFechar={() => setDebitoEditando(null)} aoSalvar={aoSalvarEdicaoDebito} />
      )}

      {debitoPagando && (
        <PagamentoDinheiroModal debito={debitoPagando} carregando={processando} aoFechar={() => setDebitoPagando(null)} aoConfirmar={aoConfirmarPagamento} />
      )}

      {debitoPix && (
        <ObservacaoConfirmModal
          titulo="Marcar pago via Pix"
          mensagem={`O débito "${debitoPix.descricao}" (${formatarMoeda(debitoPix.valor)}) vai para "Conferir Pix", aguardando confirmação do extrato.`}
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
          mensagem={`Tem certeza que deseja cancelar o débito "${debitoCancelando.descricao}"?${debitoCancelando.notinhaId ? ' Como ele está numa notinha, o total dela também será ajustado.' : ''}`}
          textoConfirmar="Cancelar débito" variantePerigo carregando={processando}
          aoFechar={() => setDebitoCancelando(null)} aoConfirmar={aoConfirmarCancelamento}
        />
      )}

      {propriedadeEditando && (
        <ModalPropriedade
          propriedadeExistente={propriedadeEditando}
          aoFechar={() => setPropriedadeEditando(null)}
          aoSalvar={async (dados) => {
            try {
              await db.atualizarPropriedade(propriedadeEditando.id, dados)
              notificar('Propriedade atualizada.', 'sucesso')
              setPropriedadeEditando(null)
              carregar()
            } catch (erro) {
              notificar(erro.message, 'erro')
            }
          }}
        />
      )}
    </div>
  )
}

// Modal para cadastrar OU editar uma propriedade/filial — quando
// `propriedadeExistente` é passado, mostra também o campo de status
// (ativo/inativo), já que só faz sentido inativar algo que já existe.
function ModalPropriedade({ propriedadeExistente, aoFechar, aoSalvar }) {
  const [nome, setNome] = useState(propriedadeExistente?.nome || '')
  const [documento, setDocumento] = useState(propriedadeExistente?.documento || '')
  const [status, setStatus] = useState(propriedadeExistente?.status || 'ativo')
  const [erro, setErro] = useState('')

  function confirmar() {
    if (!nome.trim()) return setErro('Informe o nome da propriedade.')
    setErro('')
    aoSalvar({ nome, documento, status })
  }

  return (
    <Modal
      titulo={propriedadeExistente ? 'Editar propriedade / filial' : 'Nova propriedade / filial'}
      aoFechar={aoFechar}
      largura={400}
      rodape={
        <>
          <button className="btn btn-cd-secundario" onClick={aoFechar}>Cancelar</button>
          <button className="btn btn-cd-primario" onClick={confirmar}>{propriedadeExistente ? 'Salvar alterações' : 'Adicionar'}</button>
        </>
      }
    >
      {erro && <div className="alert alert-danger py-2" style={{ fontSize: 13 }}>{erro}</div>}
      <div className="mb-3">
        <label className="cd-label">Nome</label>
        <input type="text" className="form-control" placeholder="Ex.: Filial Franca" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
      </div>
      <div className="mb-3">
        <label className="cd-label">CNPJ / documento (opcional)</label>
        <input type="text" className="form-control" value={documento} onChange={(e) => setDocumento(e.target.value)} />
      </div>
      {propriedadeExistente && (
        <div>
          <label className="cd-label">Status</label>
          <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ativo">Ativa</option>
            <option value="inativo">Inativa</option>
          </select>
          <div className="texto-fraco mt-1" style={{ fontSize: 11.5 }}>
            Uma propriedade inativa some dos seletores de novos lançamentos, mas continua aparecendo nos débitos antigos que já a usavam.
          </div>
        </div>
      )}
    </Modal>
  )
}
