import { useState } from 'react'
import Modal from '../../components/common/Modal.jsx'
import { mascararCompetencia } from '../../lib/format.js'

// Só é possível editar um débito enquanto ele está "em aberto" — depois
// que ele é cobrado ou pago, editar livremente quebraria a rastreabilidade
// (por isso essa regra também é aplicada de novo lá no lib/db.js).
export default function EditarDebitoModal({ debito, aoSalvar, aoFechar, carregando }) {
  const [descricao, setDescricao] = useState(debito.descricao)
  const [valor, setValor] = useState(debito.valor)
  const [competencia, setCompetencia] = useState(debito.competencia)
  const [observacao, setObservacao] = useState(debito.observacao || '')
  const [erro, setErro] = useState('')

  function aoClicarSalvar() {
    if (!descricao.trim()) return setErro('Informe a descrição.')
    if (!valor || Number(valor) <= 0) return setErro('Informe um valor maior que zero.')
    if (!competencia.trim()) return setErro('Informe a competência.')
    setErro('')
    aoSalvar({ descricao, valor: Number(valor), competencia, observacao })
  }

  return (
    <Modal
      titulo="Editar débito"
      subtitulo={debito.clienteNome}
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn btn-cd-secundario" onClick={aoFechar} disabled={carregando}>Cancelar</button>
          <button className="btn btn-cd-primario" onClick={aoClicarSalvar} disabled={carregando}>
            {carregando ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </>
      }
    >
      {erro && <div className="alert alert-danger py-2" style={{ fontSize: 13 }}>{erro}</div>}
      <div className="row g-3">
        <div className="col-12">
          <label className="cd-label">Descrição</label>
          <input type="text" className="form-control" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        <div className="col-6">
          <label className="cd-label">Valor (R$)</label>
          <input type="number" min="0" step="0.01" className="form-control" value={valor} onChange={(e) => setValor(e.target.value)} />
        </div>
        <div className="col-6">
          <label className="cd-label">Competência</label>
          <input
            type="text"
            className="form-control"
            placeholder="MM/AAAA"
            value={competencia}
            onChange={(e) => setCompetencia(mascararCompetencia(e.target.value))}
          />
        </div>
        <div className="col-12">
          <label className="cd-label">Observações (opcional)</label>
          <textarea className="form-control" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}
