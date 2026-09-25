import { useState } from 'react'
import Modal from './Modal.jsx'
import { formatarMoeda } from '../../lib/format.js'

// Modal usado sempre que um débito (avulso, fora de notinha) é marcado
// como "pago em dinheiro". Os campos são todos opcionais, como pedido —
// o contador pode simplesmente confirmar sem preencher nada.
export default function PagamentoDinheiroModal({ debito, aoConfirmar, aoFechar, carregando }) {
  const [forma, setForma] = useState('Dinheiro')
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [obs, setObs] = useState('')

  return (
    <Modal
      titulo="Marcar como pago"
      subtitulo={`${debito.clienteNome} — ${debito.descricao} · ${formatarMoeda(debito.valor)}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn btn-cd-secundario" onClick={aoFechar} disabled={carregando}>Cancelar</button>
          <button
            className="btn btn-cd-primario"
            disabled={carregando}
            onClick={() => aoConfirmar({ formaPagamento: forma, dataPagamento: data, obs })}
          >
            {carregando ? 'Aguarde...' : 'Confirmar pagamento'}
          </button>
        </>
      }
    >
      <div className="row g-3">
        <div className="col-6">
          <label className="cd-label">Forma de pagamento (opcional)</label>
          <select className="form-select" value={forma} onChange={(e) => setForma(e.target.value)}>
            <option>Dinheiro</option>
            <option>Cartão</option>
            <option>Transferência</option>
            <option>Boleto</option>
            <option>Outro</option>
          </select>
        </div>
        <div className="col-6">
          <label className="cd-label">Data do pagamento (opcional)</label>
          <input type="date" className="form-control" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="col-12">
          <label className="cd-label">Observações (opcional)</label>
          <textarea className="form-control" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}
