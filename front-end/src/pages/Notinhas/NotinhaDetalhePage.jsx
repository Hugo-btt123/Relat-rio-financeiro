import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as db from '../../lib/db.js'
import { formatarData, formatarDataHora, formatarMoeda } from '../../lib/format.js'
import { useToast } from '../../context/ToastContext.jsx'
import StatusBadge from '../../components/common/StatusBadge.jsx'
import ConfirmModal from '../../components/common/ConfirmModal.jsx'
import ObservacaoConfirmModal from '../../components/common/ObservacaoConfirmModal.jsx'
import AlterarStatusDebitoModal from '../../components/common/AlterarStatusDebitoModal.jsx'
import PagamentoParcialModal from './PagamentoParcialModal.jsx'

export default function NotinhaDetalhePage() {
  const { id } = useParams()
  const navegar = useNavigate()
  const { notificar } = useToast()

  const [notinha, setNotinha] = useState(null)
  const [historico, setHistorico] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [itemAlterandoStatus, setItemAlterandoStatus] = useState(null)

  const [confirmando, setConfirmando] = useState(null) // 'dinheiro' | 'pix' | 'estorno' | null
  const [modalParcial, setModalParcial] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [n, h] = await Promise.all([db.buscarNotinhaPorId(id), db.listarHistoricoDaNotinha(id)])
    setNotinha(n)
    setHistorico(h)
    setCarregando(false)
  }, [id])

  useEffect(() => { carregar() }, [carregar])

  if (carregando) return <div className="cd-vazio">Carregando...</div>
  if (!notinha) return <div className="cd-vazio">Notinha não encontrada. <a className="link-discreto" onClick={() => navegar('/notinhas')}>Voltar</a></div>

  const totalOriginal = notinha.total
  // totalAberto já vem calculado corretamente do lib/db.js: total menos o
  // que já foi pago menos o que está aguardando confirmação de Pix.
  const totalRestante = notinha.totalAberto

  async function aoPagarDinheiro() {
    setProcessando(true)
    try {
      await db.pagarNotinhaTotalDinheiro(id)
      notificar('Notinha paga em dinheiro.', 'sucesso')
      setConfirmando(null)
      carregar()
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setProcessando(false)
    }
  }

  async function aoPagarPix(obs) {
    setProcessando(true)
    try {
      await db.pagarNotinhaTotalPix(id, obs)
      notificar('Marcado como pago via Pix — aguardando conferência.', 'sucesso')
      setConfirmando(null)
      carregar()
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setProcessando(false)
    }
  }

  async function aoPagarParcial(dados) {
    setProcessando(true)
    try {
      await db.pagarNotinhaParcial(id, dados)
      notificar(dados.forma === 'Pix' ? 'Pagamento parcial via Pix registrado — aguardando conferência.' : 'Pagamento parcial registrado.', 'sucesso')
      setModalParcial(false)
      carregar()
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setProcessando(false)
    }
  }

  async function aoEstornar() {
    setProcessando(true)
    try {
      await db.estornarNotinha(id)
      notificar('Notinha estornada — itens voltaram para "em aberto".', 'sucesso')
      setConfirmando(null)
      carregar()
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setProcessando(false)
    }
  }

  async function aoReabrir() {
    setProcessando(true)
    try {
      await db.reabrirNotinha(id, 'Reaberta manualmente pelo contador.')
      notificar('Notinha reaberta — o pagamento foi desfeito.', 'sucesso')
      setConfirmando(null)
      carregar()
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setProcessando(false)
    }
  }

  async function aoAlterarStatusItem(dados) {
    setProcessando(true)
    try {
      await db.alterarStatusDebito(itemAlterandoStatus.id, dados.alvo, dados)
      notificar('Status do item atualizado.', 'sucesso')
      setItemAlterandoStatus(null)
      carregar()
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setProcessando(false)
    }
  }

  const podeAgir = notinha.status === 'ativa'
  const temItensParaPagar = notinha.itens.some((i) => i.status === 'cobrado' && !i.pixPendente)

  return (
    <div>
      <a className="link-discreto nao-imprimir" style={{ cursor: 'pointer', fontSize: 13 }} onClick={() => navegar('/notinhas')}>
        <i className="bi bi-arrow-left me-1" /> Notinhas
      </a>

      <div className="d-flex justify-content-between align-items-start mt-2 mb-3">
        <div>
          <h1>{notinha.numero}</h1>
          <div style={{ marginTop: 4 }}><StatusBadge status={notinha.statusExibicao} /></div>
        </div>
      </div>

      <div className="cd-card mb-3">
        <div className="cd-card__corpo">
          <div className="row mb-3" style={{ fontSize: 13.5 }}>
            <div className="col-4">
              <div className="texto-suave" style={{ fontSize: 11.5, fontWeight: 600 }}>CLIENTE</div>
              <a className="link-discreto" style={{ cursor: 'pointer' }} onClick={() => navegar(`/clientes/${notinha.clienteId}`)}>{notinha.clienteNome}</a>
            </div>
            <div className="col-4">
              <div className="texto-suave" style={{ fontSize: 11.5, fontWeight: 600 }}>COMPETÊNCIA</div>
              {notinha.competencia}
            </div>
            <div className="col-4">
              <div className="texto-suave" style={{ fontSize: 11.5, fontWeight: 600 }}>GERADA EM</div>
              {formatarData(notinha.criadoEm)}
            </div>
          </div>

          <table className="cd-tabela">
            <thead>
              <tr><th>Descrição</th><th>Propriedade</th><th>Competência</th><th>Status</th><th className="text-end">Valor</th><th className="nao-imprimir"></th></tr>
            </thead>
            <tbody>
              {notinha.itens.map((item) => (
                <tr key={item.id} className={item.status === 'cancelado' ? 'linha-cancelada' : ''}>
                  <td>{item.descricao}</td>
                  <td className="texto-suave">{item.propriedadeNome || '—'}</td>
                  <td><span className="cd-chip-competencia">{item.competencia}</span></td>
                  <td><StatusBadge status={item.status} pixPendente={item.pixPendente} /></td>
                  <td className="text-end num">{formatarMoeda(item.valor)}</td>
                  <td className="text-end nao-imprimir">
                    {(item.status === 'cobrado' || item.status === 'pago') && (
                      <button className="btn btn-sm btn-cd-secundario" title="Alterar status / estornar" onClick={() => setItemAlterandoStatus(item)}>
                        <i className="bi bi-arrow-repeat" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {notinha.totalPago > 0 && (
                <tr>
                  <td colSpan={4} className="text-end texto-suave">Pago</td>
                  <td className="text-end num texto-suave">{formatarMoeda(notinha.totalPago)}</td>
                  <td className="nao-imprimir"></td>
                </tr>
              )}
              {notinha.totalPixPendente > 0 && (
                <tr>
                  <td colSpan={4} className="text-end" style={{ color: 'var(--cd-dourado-700)' }}>Aguardando Pix</td>
                  <td className="text-end num" style={{ color: 'var(--cd-dourado-700)' }}>{formatarMoeda(notinha.totalPixPendente)}</td>
                  <td className="nao-imprimir"></td>
                </tr>
              )}
              <tr>
                <td colSpan={4} className="text-end"><strong>Total</strong></td>
                <td className="text-end num">
                  {notinha.totalPago > 0 || notinha.totalPixPendente > 0 ? (
                    <>
                      <span className="texto-riscado me-2">{formatarMoeda(totalOriginal)}</span>
                      <strong style={{ fontSize: 16 }}>{formatarMoeda(Math.max(totalRestante, 0))}</strong>
                    </>
                  ) : (
                    <strong style={{ fontSize: 16 }}>{formatarMoeda(totalOriginal)}</strong>
                  )}
                </td>
                <td className="nao-imprimir"></td>
              </tr>
            </tfoot>
          </table>

          {notinha.observacoes && (
            <div className="mt-2 texto-suave" style={{ fontSize: 13 }}>
              <i className="bi bi-chat-left-text me-1" /> {notinha.observacoes}
            </div>
          )}
        </div>
      </div>

      <div className="cd-card mb-3">
        <div className="cd-card__corpo">
          <strong style={{ fontSize: 13.5 }}>Histórico da notinha</strong>
          {historico.length === 0 ? (
            <div className="texto-fraco mt-2" style={{ fontSize: 13 }}>Nenhum evento ainda.</div>
          ) : (
            <div className="cd-linha-tempo mt-3">
              {historico.map((h) => (
                <div key={h.id} className={`cd-linha-tempo__item ${h.acao.includes('Pag') || h.acao.includes('Quitada') ? 'pago' : h.acao.includes('Estornada') ? 'cancelado' : ''}`}>
                  <div className="cd-linha-tempo__ponto" />
                  <div style={{ fontSize: 13.5 }}>
                    <strong>{h.acao}</strong>
                    {h.detalhes && <span className="texto-suave"> · {h.detalhes}</span>}
                  </div>
                  <div className="texto-fraco" style={{ fontSize: 11.5 }}>{formatarDataHora(h.quando)} · por {h.operador}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="d-flex gap-2 flex-wrap nao-imprimir">
        <button className="btn btn-cd-secundario" onClick={() => window.print()}>
          <i className="bi bi-printer me-1" /> Imprimir
        </button>
        {notinha.status !== 'estornada' && (
          <button className="btn btn-cd-secundario" onClick={() => navegar(`/notinhas/${id}/editar`)}>
            <i className="bi bi-pencil me-1" /> Editar notinha
          </button>
        )}
        {podeAgir && temItensParaPagar && (
          <>
            <button className="btn btn-cd-secundario" onClick={() => setConfirmando('dinheiro')}>
              <i className="bi bi-cash-coin me-1" /> Pagar tudo (dinheiro)
            </button>
            <button className="btn btn-cd-secundario" onClick={() => setConfirmando('pix')}>
              <i className="bi bi-phone me-1" /> Pagar tudo (Pix)
            </button>
            <button className="btn btn-cd-secundario" onClick={() => setModalParcial(true)}>
              <i className="bi bi-cash me-1" /> Pagar parcial
            </button>
          </>
        )}
        {podeAgir && (
          <button className="btn btn-cd-perigo ms-auto" onClick={() => setConfirmando('estorno')}>
            <i className="bi bi-arrow-counterclockwise me-1" /> Estornar notinha
          </button>
        )}
        {notinha.status === 'paga' && (
          <button className="btn btn-cd-secundario ms-auto" onClick={() => setConfirmando('reabrir')}>
            <i className="bi bi-arrow-clockwise me-1" /> Reabrir notinha
          </button>
        )}
      </div>

      {confirmando === 'dinheiro' && (
        <ConfirmModal
          titulo="Pagar tudo em dinheiro"
          mensagem={`Confirma o recebimento de ${formatarMoeda(totalRestante)} em dinheiro? Todos os itens em aberto desta notinha serão marcados como pagos.`}
          textoConfirmar="Confirmar pagamento" carregando={processando}
          aoFechar={() => setConfirmando(null)} aoConfirmar={aoPagarDinheiro}
        />
      )}
      {confirmando === 'pix' && (
        <ObservacaoConfirmModal
          titulo="Pagar tudo via Pix"
          mensagem="Os itens desta notinha ficarão marcados como 'Pix a conferir' até você confirmar o extrato na tela Conferir Pix."
          textoConfirmar="Marcar como pago via Pix" carregando={processando}
          aoFechar={() => setConfirmando(null)} aoConfirmar={aoPagarPix}
        />
      )}
      {confirmando === 'estorno' && (
        <ConfirmModal
          titulo="Estornar notinha"
          mensagem="Todos os débitos desta notinha voltarão para 'em aberto' e a notinha ficará marcada como estornada (ela não será apagada)."
          textoConfirmar="Estornar" variantePerigo carregando={processando}
          aoFechar={() => setConfirmando(null)} aoConfirmar={aoEstornar}
        />
      )}
      {confirmando === 'reabrir' && (
        <ConfirmModal
          titulo="Reabrir notinha"
          mensagem="O pagamento registrado será desfeito e os itens voltarão para 'cobrado', continuando vinculados a esta notinha. Use isso se algo foi pago por engano."
          textoConfirmar="Reabrir" carregando={processando}
          aoFechar={() => setConfirmando(null)} aoConfirmar={aoReabrir}
        />
      )}
      {modalParcial && (
        <PagamentoParcialModal notinha={notinha} carregando={processando} aoFechar={() => setModalParcial(false)} aoConfirmar={aoPagarParcial} />
      )}
      {itemAlterandoStatus && (
        <AlterarStatusDebitoModal
          debito={itemAlterandoStatus}
          carregando={processando}
          aoFechar={() => setItemAlterandoStatus(null)}
          aoConfirmar={aoAlterarStatusItem}
        />
      )}
    </div>
  )
}
