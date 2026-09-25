import { useState } from 'react'
import Modal from '../../components/common/Modal.jsx'
import ClienteAutocomplete from '../../components/common/ClienteAutocomplete.jsx'
import { mascararCompetencia, formatarMoeda } from '../../lib/format.js'
import * as db from '../../lib/db.js'

function linhaVazia() {
  return { chave: Math.random().toString(36).slice(2), clienteId: null, clienteNome: '', propriedadeId: null, valor: '', observacao: '', propriedades: [] }
}

// "Lançar em grupo": uma descrição + competência únicas, mas vários
// clientes, cada um com seu próprio valor (e opcionalmente propriedade e
// observação). Gera um débito "em aberto" para cada linha válida.
export default function LancamentoGrupoModal({ competenciaPadrao, aoConcluir, aoFechar }) {
  const [descricao, setDescricao] = useState('')
  const [competencia, setCompetencia] = useState(competenciaPadrao)
  const [linhas, setLinhas] = useState([linhaVazia(), linhaVazia()])
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const linhasValidas = linhas.filter((l) => l.clienteId && Number(l.valor) > 0)
  const total = linhasValidas.reduce((s, l) => s + Number(l.valor), 0)

  function atualizarLinha(chave, patch) {
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, ...patch } : l)))
  }

  async function aoSelecionarCliente(chave, cliente) {
    if (!cliente) {
      atualizarLinha(chave, { clienteId: null, clienteNome: '', propriedadeId: null, propriedades: [] })
      return
    }
    const propriedades = await db.listarPropriedades(cliente.id)
    atualizarLinha(chave, { clienteId: cliente.id, clienteNome: cliente.nome, propriedadeId: null, propriedades })
  }

  function adicionarLinha() {
    setLinhas((atual) => [...atual, linhaVazia()])
  }

  function removerLinha(chave) {
    setLinhas((atual) => atual.filter((l) => l.chave !== chave))
  }

  async function aoLancar() {
    setErro('')
    if (!descricao.trim()) return setErro('Informe a descrição do débito.')
    if (!competencia.trim()) return setErro('Informe a competência.')
    if (linhasValidas.length === 0) return setErro('Adicione ao menos um cliente com valor maior que zero.')

    setEnviando(true)
    try {
      await db.criarDebitosEmGrupo({
        descricao,
        competencia,
        linhas: linhasValidas.map((l) => ({
          clienteId: l.clienteId, propriedadeId: l.propriedadeId, valor: l.valor, observacao: l.observacao,
        })),
      })
      aoConcluir(linhasValidas.length)
    } catch (e) {
      setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      titulo="Lançamento em grupo"
      subtitulo="Uma descrição e competência, vários clientes com valores diferentes — gera um débito para cada."
      aoFechar={aoFechar}
      largura={640}
      rodape={
        <>
          <div className="me-auto d-flex align-items-center gap-2" style={{ fontSize: 12.5 }}>
            <span className="texto-suave">{linhasValidas.length} linha(s) válida(s)</span>
            <strong className="num" style={{ fontSize: 15, color: 'var(--cd-azul-950)' }}>{formatarMoeda(total)}</strong>
          </div>
          <button className="btn btn-cd-secundario" onClick={aoFechar} disabled={enviando}>Cancelar</button>
          <button className="btn btn-cd-primario" onClick={aoLancar} disabled={enviando}>
            {enviando ? 'Lançando...' : `Lançar ${linhasValidas.length || ''}`}
          </button>
        </>
      }
    >
      {erro && <div className="alert alert-danger py-2" style={{ fontSize: 13 }}>{erro}</div>}

      <div className="row g-3 mb-2">
        <div className="col-7">
          <label className="cd-label">Descrição</label>
          <input type="text" className="form-control" placeholder="Ex.: FGTS, IRPF, Honorários..." value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        <div className="col-5">
          <label className="cd-label">Competência</label>
          <input type="text" className="form-control" placeholder="MM/AAAA" value={competencia} onChange={(e) => setCompetencia(mascararCompetencia(e.target.value))} />
        </div>
      </div>

      <label className="cd-label mt-2">Clientes e valores</label>
      <div className="d-flex flex-column gap-2">
        {linhas.map((linha) => (
          <div key={linha.chave} className="cd-card" style={{ padding: 10 }}>
            <div className="d-flex gap-2 align-items-start">
              <div style={{ flex: '1 1 40%' }}>
                <ClienteAutocomplete valorClienteId={linha.clienteId} aoSelecionar={(c) => aoSelecionarCliente(linha.chave, c)} />
              </div>
              <select
                className="form-select"
                style={{ flex: '1 1 25%' }}
                value={linha.propriedadeId || ''}
                onChange={(e) => atualizarLinha(linha.chave, { propriedadeId: e.target.value || null })}
                disabled={linha.propriedades.length === 0}
              >
                <option value="">— Sem propriedade —</option>
                {linha.propriedades.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
              <input
                type="number" min="0" step="0.01"
                className="form-control num"
                style={{ flex: '1 1 20%' }}
                placeholder="0,00"
                value={linha.valor}
                onChange={(e) => atualizarLinha(linha.chave, { valor: e.target.value })}
              />
              <button type="button" className="btn btn-cd-secundario" onClick={() => removerLinha(linha.chave)} title="Remover linha">
                <i className="bi bi-trash" />
              </button>
            </div>
            <input
              type="text"
              className="form-control mt-2"
              placeholder="Observação para este cliente (opcional)"
              value={linha.observacao}
              onChange={(e) => atualizarLinha(linha.chave, { observacao: e.target.value })}
            />
          </div>
        ))}
      </div>

      <button type="button" className="btn btn-cd-secundario btn-sm mt-2" onClick={adicionarLinha}>
        <i className="bi bi-plus-lg me-1" /> Adicionar cliente
      </button>
    </Modal>
  )
}
