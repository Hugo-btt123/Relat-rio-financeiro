import { useState } from 'react'
import Modal from '../../components/common/Modal.jsx'
import { formatarMoeda } from '../../lib/format.js'

// Pagamento parcial de uma notinha: o valor informado é abatido dos itens
// em ordem — a lógica de rateio fica toda no lib/db.js.
export default function PagamentoParcialModal({ notinha, aoConfirmar, aoFechar, carregando }) {
  const [valor, setValor] = useState('')
  const [forma, setForma] = useState('Dinheiro')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')

  function confirmar() {
    if (!valor || Number(valor) <= 0) return setErro('Informe um valor maior que zero.')
    setErro('')
    aoConfirmar({ valor: Number(valor), forma, data, obs })
  }

  return (
    <Modal
      titulo="Pagamento parcial"
      subtitulo={`Restam ${formatarMoeda(notinha.totalAberto)} em aberto nesta notinha.`}
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn btn-cd-secundario" onClick={aoFechar} disabled={carregando}>Cancelar</button>
          <button className="btn btn-cd-primario" onClick={confirmar} disabled={carregando}>
            {carregando ? 'Registrando...' : 'Registrar pagamento'}
          </button>
        </>
      }
    >
      {erro && <div className="alert alert-danger py-2" style={{ fontSize: 13 }}>{erro}</div>}
      <div className="row g-3">
        <div className="col-6">
          <label className="cd-label">Valor pago (R$)</label>
          <input type="number" min="0" step="0.01" className="form-control num" autoFocus value={valor} onChange={(e) => setValor(e.target.value)} />
        </div>
        <div className="col-6">
          <label className="cd-label">Forma de pagamento</label>
          <select className="form-select" value={forma} onChange={(e) => setForma(e.target.value)}>
            <option>Dinheiro</option><option>Pix</option><option>Cartão</option><option>Transferência</option><option>Outro</option>
          </select>
        </div>
        <div className="col-6">
          <label className="cd-label">Data</label>
          <input type="date" className="form-control" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="col-12">
          <label className="cd-label">Observações (opcional)</label>
          <textarea className="form-control" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
        </div>
      </div>
      <div className="texto-fraco mt-2" style={{ fontSize: 11.5 }}>
        {forma === 'Pix'
          ? 'Pago via Pix: os itens ficam "aguardando conferência" na aba Conferir Pix até você confirmar o extrato — só então contam como pagos de verdade.'
          : 'O valor é abatido dos itens em ordem: quando não fecha um item inteiro, a sobra fica guardada como crédito para o próximo pagamento.'}
      </div>
    </Modal>
  )
}
