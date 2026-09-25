import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as db from '../../lib/db.js'
import { competenciaAtual } from '../../lib/db.js'
import { formatarMoeda, mascararCompetencia } from '../../lib/format.js'

function CartaoMetrica({ rotulo, valor, legenda, icone, cor }) {
  return (
    <div className="cd-metrica">
      <div className="cd-metrica__rotulo" style={{ color: cor || undefined }}>
        {icone && <i className={`bi ${icone}`} />} {rotulo}
      </div>
      <div className="cd-metrica__valor">{valor}</div>
      {legenda && <div className="cd-metrica__legenda">{legenda}</div>}
    </div>
  )
}

export default function DashboardPage() {
  const navegar = useNavigate()
  const [competenciaInput, setCompetenciaInput] = useState(competenciaAtual())
  const [competencia, setCompetencia] = useState(competenciaAtual())
  const [metricas, setMetricas] = useState(null)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const m = await db.obterMetricasDashboard(competencia)
    setMetricas(m)
    setCarregando(false)
  }, [competencia])

  useEffect(() => { carregar() }, [carregar])

  return (
    <div>
      <div className="cd-pagina__cabecalho d-flex justify-content-between align-items-end flex-wrap gap-2">
        <div>
          <h1>Dashboard</h1>
          <p className="cd-pagina__subtitulo">Resumo da competência {competencia}.</p>
        </div>
        <div className="d-flex align-items-end gap-2">
          <div>
            <label className="cd-label">Competência</label>
            <input type="text" className="form-control" style={{ width: 140 }} value={competenciaInput} onChange={(e) => setCompetenciaInput(mascararCompetencia(e.target.value))} />
          </div>
          <button className="btn btn-cd-primario" onClick={() => setCompetencia(competenciaInput)}>Aplicar</button>
        </div>
      </div>

      {carregando || !metricas ? (
        <div className="cd-vazio">Carregando...</div>
      ) : (
        <>
          <div className="row g-3 mb-3">
            <div className="col-md-3 col-6">
              <CartaoMetrica rotulo="EM ABERTO" valor={formatarMoeda(metricas.emAberto.total)} legenda={`${metricas.emAberto.qtd} débito(s)`} cor="var(--cd-laranja)" />
            </div>
            <div className="col-md-3 col-6">
              <CartaoMetrica rotulo="COBRADO (EM NOTINHA)" valor={formatarMoeda(metricas.cobrado.total)} legenda={`${metricas.cobrado.qtd} débito(s)`} cor="var(--cd-azul-info)" />
            </div>
            <div className="col-md-3 col-6">
              <CartaoMetrica rotulo="PAGO" valor={formatarMoeda(metricas.pago.total)} legenda={`${metricas.pago.qtd} débito(s)`} cor="var(--cd-verde)" />
            </div>
            <div className="col-md-3 col-6">
              <CartaoMetrica rotulo="PIX AGUARDANDO CONFERÊNCIA" valor={formatarMoeda(metricas.pixPendente.total)} legenda={`${metricas.pixPendente.qtd} pendente(s)`} cor="var(--cd-dourado-700)" />
            </div>
            <div className="col-md-3 col-6">
              <CartaoMetrica rotulo="NOTINHAS ATIVAS" valor={metricas.notinhasAtivas} legenda="aguardando pagamento" />
            </div>
            <div className="col-md-3 col-6">
              <CartaoMetrica rotulo="NOTINHAS PAGAS" valor={metricas.notinhasPagas} legenda="quitadas no mês" />
            </div>
            <div className="col-md-3 col-6">
              <CartaoMetrica rotulo="TOTAL FATURADO" valor={formatarMoeda(metricas.totalFaturado)} legenda="aberto + cobrado + pago" />
            </div>
            <div className="col-md-3 col-6">
              <CartaoMetrica rotulo="CANCELADO" valor={formatarMoeda(metricas.cancelado.total)} legenda="excluído do mês" cor="var(--cd-vermelho)" />
            </div>
          </div>

          <div className="cd-card">
            <div className="cd-card__corpo">
              <strong style={{ fontSize: 14 }}>Top 5 — maior valor em aberto</strong>
              {metricas.topInadimplentes.length === 0 ? (
                <div className="texto-fraco mt-2" style={{ fontSize: 13 }}>Nenhum cliente com débitos em aberto no momento. 🎉</div>
              ) : (
                <div className="mt-2">
                  {metricas.topInadimplentes.map((c, i) => (
                    <div
                      key={c.clienteId}
                      onClick={() => navegar(`/clientes/${c.clienteId}`)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 4px', borderBottom: i < metricas.topInadimplentes.length - 1 ? '1px solid var(--cd-borda)' : 'none', cursor: 'pointer' }}
                    >
                      <div style={{ fontSize: 13.5 }}>
                        <span className="texto-fraco me-2">{i + 1}.</span>
                        <strong>{c.nome}</strong>
                        <span className="cd-badge cd-badge--neutro ms-2">{c.qtd} débito(s)</span>
                      </div>
                      <div className="num" style={{ fontWeight: 700, color: 'var(--cd-laranja)' }}>{formatarMoeda(c.total)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
