import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as db from '../../lib/db.js'
import { formatarData, formatarMoeda } from '../../lib/format.js'
import StatusBadge from '../../components/common/StatusBadge.jsx'

// Essa tela NUNCA grava nada no banco — ela só busca as notinhas escolhidas
// e monta um resumo consolidado, para o contador imprimir de uma vez (ex.:
// "Maria quer pagar as notinhas de 04/2026 a 08/2026 tudo junto"). As
// notinhas originais continuam exatamente como estavam antes.
export default function NotinhasAgrupadasPage() {
  const navegar = useNavigate()
  const [params] = useSearchParams()
  const ids = (params.get('ids') || '').split(',').filter(Boolean)

  const [notinhas, setNotinhas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      setCarregando(true)
      setErro('')
      const encontradas = (await Promise.all(ids.map((id) => db.buscarNotinhaPorId(id)))).filter(Boolean)
      if (cancelado) return

      if (encontradas.length < 2) {
        setErro('Selecione ao menos duas notinhas na lista para agrupar.')
      } else {
        const clientesDiferentes = new Set(encontradas.map((n) => n.clienteId))
        if (clientesDiferentes.size > 1) {
          setErro('Só é possível agrupar notinhas do mesmo cliente.')
        }
      }
      setNotinhas(encontradas.sort((a, b) => (a.competencia > b.competencia ? 1 : -1)))
      setCarregando(false)
    }
    carregar()
    return () => { cancelado = true }
  }, [params])

  if (carregando) return <div className="cd-vazio">Carregando...</div>

  if (erro) {
    return (
      <div>
        <a className="link-discreto nao-imprimir" style={{ cursor: 'pointer', fontSize: 13 }} onClick={() => navegar('/notinhas')}>
          <i className="bi bi-arrow-left me-1" /> Notinhas
        </a>
        <div className="cd-vazio mt-3">{erro}</div>
      </div>
    )
  }

  const cliente = notinhas[0]
  const totalGeral = notinhas.reduce((s, n) => s + n.total, 0)
  const totalPagoGeral = notinhas.reduce((s, n) => s + n.totalPago, 0)
  const totalPixPendenteGeral = notinhas.reduce((s, n) => s + n.totalPixPendente, 0)
  const totalEmAbertoGeral = notinhas.reduce((s, n) => s + n.totalAberto, 0)

  return (
    <div>
      <a className="link-discreto nao-imprimir" style={{ cursor: 'pointer', fontSize: 13 }} onClick={() => navegar('/notinhas')}>
        <i className="bi bi-arrow-left me-1" /> Notinhas
      </a>

      <div className="cd-pagina__cabecalho mt-2 d-flex justify-content-between align-items-start">
        <div>
          <h1>Resumo agrupado</h1>
          <p className="cd-pagina__subtitulo">
            {cliente.clienteNome} · {notinhas.length} notinhas ({notinhas.map((n) => n.numero).join(', ')})
          </p>
        </div>
        <button className="btn btn-cd-ouro nao-imprimir" onClick={() => window.print()}>
          <i className="bi bi-printer me-1" /> Imprimir
        </button>
      </div>

      <div className="alert alert-secondary nao-imprimir" style={{ fontSize: 12.5 }}>
        <i className="bi bi-info-circle me-1" />
        Isso é só uma visão de impressão — as notinhas originais listadas abaixo continuam exatamente como estavam,
        nada foi alterado ou combinado de verdade no sistema.
      </div>

      <div className="row g-3 mb-3">
        <div className="col-md-3 col-6">
          <div className="cd-metrica">
            <div className="cd-metrica__rotulo">TOTAL GERAL</div>
            <div className="cd-metrica__valor" style={{ fontSize: 22 }}>{formatarMoeda(totalGeral)}</div>
          </div>
        </div>
        <div className="col-md-3 col-6">
          <div className="cd-metrica">
            <div className="cd-metrica__rotulo" style={{ color: 'var(--cd-verde)' }}>PAGO</div>
            <div className="cd-metrica__valor" style={{ fontSize: 22 }}>{formatarMoeda(totalPagoGeral)}</div>
          </div>
        </div>
        {totalPixPendenteGeral > 0 && (
          <div className="col-md-3 col-6">
            <div className="cd-metrica">
              <div className="cd-metrica__rotulo" style={{ color: 'var(--cd-dourado-700)' }}>AGUARDANDO PIX</div>
              <div className="cd-metrica__valor" style={{ fontSize: 22 }}>{formatarMoeda(totalPixPendenteGeral)}</div>
            </div>
          </div>
        )}
        <div className="col-md-3 col-6">
          <div className="cd-metrica">
            <div className="cd-metrica__rotulo" style={{ color: 'var(--cd-laranja)' }}>EM ABERTO</div>
            <div className="cd-metrica__valor" style={{ fontSize: 22 }}>{formatarMoeda(totalEmAbertoGeral)}</div>
          </div>
        </div>
      </div>

      {notinhas.map((n) => (
        <div className="cd-card mb-3" key={n.id}>
          <div className="cd-card__corpo">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <strong style={{ fontSize: 14 }}>
                {n.numero} <span className="texto-suave">· competência {n.competencia} · criada em {formatarData(n.criadoEm)}</span>
              </strong>
              <StatusBadge status={n.statusExibicao} />
            </div>
            <table className="cd-tabela">
              <thead>
                <tr><th>Descrição</th><th>Propriedade</th><th>Status</th><th className="text-end">Valor</th></tr>
              </thead>
              <tbody>
                {n.itens.map((item) => (
                  <tr key={item.id} className={item.status === 'cancelado' ? 'linha-cancelada' : ''}>
                    <td>{item.descricao}</td>
                    <td className="texto-suave">{item.propriedadeNome || '—'}</td>
                    <td><StatusBadge status={item.status} pixPendente={item.pixPendente} /></td>
                    <td className="text-end num">{formatarMoeda(item.valor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="text-end"><strong>Em aberto nesta notinha</strong></td>
                  <td className="text-end num"><strong>{formatarMoeda(n.totalAberto)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}

      <div className="cd-card">
        <div className="cd-card__corpo d-flex justify-content-between align-items-center">
          <strong style={{ fontSize: 15 }}>Total em aberto (todas as notinhas acima)</strong>
          <strong className="num" style={{ fontSize: 22, color: 'var(--cd-laranja)' }}>{formatarMoeda(totalEmAbertoGeral)}</strong>
        </div>
      </div>
    </div>
  )
}
