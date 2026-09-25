import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as db from '../../lib/db.js'
import { formatarData, formatarMoeda } from '../../lib/format.js'
import { useToast } from '../../context/ToastContext.jsx'
import ConfirmModal from '../../components/common/ConfirmModal.jsx'

// Aqui ficam todos os pagamentos via Pix aguardando conferência no
// extrato — débitos avulsos, notinhas inteiras (agrupadas numa linha só)
// e "créditos" de pagamentos parciais que ainda não fecharam um item
// inteiro. Confirmar aqui os move definitivamente para "pago".
export default function ConferirPixPage() {
  const navegar = useNavigate()
  const { notificar } = useToast()
  const [lista, setLista] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [confirmando, setConfirmando] = useState(null)
  const [processando, setProcessando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const l = await db.listarPixPendentes()
    setLista(l)
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function aoConfirmar() {
    setProcessando(true)
    try {
      if (confirmando.tipo === 'notinha') {
        await db.confirmarPixEmLote(confirmando.debitoIds)
      } else if (confirmando.tipo === 'credito-notinha') {
        await db.confirmarCreditoPixNotinha(confirmando.notinhaId)
      } else {
        await db.confirmarPix(confirmando.id)
      }
      notificar('Pix conferido — marcado como pago.', 'sucesso')
      setConfirmando(null)
      carregar()
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setProcessando(false)
    }
  }

  const total = lista.reduce((s, item) => s + item.valor, 0)

  function mensagemConfirmacao(item) {
    if (item.tipo === 'notinha') {
      return `Confirma que a notinha ${item.notinhaNumero} de ${item.clienteNome} (${formatarMoeda(item.valor)}) foi paga via Pix e já caiu na conta? Todos os itens dela serão marcados como pagos.`
    }
    if (item.tipo === 'credito-notinha') {
      return `Confirma que o pagamento parcial de ${formatarMoeda(item.valor)} (de ${item.clienteNome}, notinha ${item.notinhaNumero}) caiu na conta? Esse valor passa a valer como crédito confirmado nessa notinha.`
    }
    return `Confirma que o Pix de ${formatarMoeda(item.valor)} de ${item.clienteNome} caiu na conta? O débito será marcado como pago.`
  }

  return (
    <div>
      <div className="cd-pagina__cabecalho">
        <h1>Conferir Pix</h1>
        <p className="cd-pagina__subtitulo">Pagamentos via Pix aguardando conferência no extrato bancário.</p>
      </div>

      {!carregando && lista.length > 0 && (
        <div className="cd-metrica mb-3" style={{ maxWidth: 280 }}>
          <div className="cd-metrica__rotulo"><i className="bi bi-phone" /> AGUARDANDO CONFERÊNCIA</div>
          <div className="cd-metrica__valor">{formatarMoeda(total)}</div>
          <div className="cd-metrica__legenda">{lista.length} pendência(s)</div>
        </div>
      )}

      <div className="cd-card">
        {carregando ? (
          <div className="cd-vazio">Carregando...</div>
        ) : lista.length === 0 ? (
          <div className="cd-vazio">
            <i className="bi bi-check2-circle" style={{ fontSize: 28, display: 'block', marginBottom: 8 }} />
            Nenhum Pix pendente de conferência no momento.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cd-tabela">
              <thead>
                <tr>
                  <th>Marcado em</th><th>Cliente</th><th>Descrição</th>
                  <th>Origem</th><th>Observação</th><th className="text-end">Valor</th><th></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((item) => (
                  <tr key={item.id}>
                    <td className="texto-suave">{formatarData(item.atualizadoEm)}</td>
                    <td>
                      <a className="link-discreto" style={{ cursor: 'pointer' }} onClick={() => navegar(`/clientes/${item.clienteId}`)}>{item.clienteNome}</a>
                    </td>
                    <td>
                      {item.descricao}
                      {item.tipo !== 'debito' && (
                        <div className="cd-badge cd-badge--pix mt-1">
                          {formatarMoeda(item.valor)} de {formatarMoeda(item.totalNotinha)}
                        </div>
                      )}
                      {item.tipo === 'debito' && item.pixParcialDaNotinha && (
                        <div className="cd-badge cd-badge--pix mt-1">
                          {formatarMoeda(item.totalPendenteNotinha)} de {formatarMoeda(item.totalNotinha)} · pago parcialmente
                        </div>
                      )}
                    </td>
                    <td>
                      {item.notinhaId ? (
                        <a className="link-discreto" style={{ cursor: 'pointer' }} onClick={() => navegar(`/notinhas/${item.notinhaId}`)}>{item.notinhaNumero || 'notinha'}</a>
                      ) : (
                        <span className="texto-fraco">avulso</span>
                      )}
                    </td>
                    <td className="texto-suave" style={{ fontSize: 12.5, maxWidth: 200 }}>{item.obsPagamento || '—'}</td>
                    <td className="text-end num">{formatarMoeda(item.valor)}</td>
                    <td className="text-end">
                      <button className="btn btn-sm btn-cd-ouro" onClick={() => setConfirmando(item)}>
                        <i className="bi bi-check-lg me-1" /> Confirmar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmando && (
        <ConfirmModal
          titulo="Confirmar Pix"
          mensagem={mensagemConfirmacao(confirmando)}
          textoConfirmar="Confirmar recebimento" carregando={processando}
          aoFechar={() => setConfirmando(null)} aoConfirmar={aoConfirmar}
        />
      )}
    </div>
  )
}
