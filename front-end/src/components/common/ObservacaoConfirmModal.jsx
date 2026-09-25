import { useState } from 'react'
import Modal from './Modal.jsx'

// Igual ao ConfirmModal, mas com uma caixa de observação opcional — usado
// nas ações de Pix, onde pode ser útil anotar algo (ex.: "comprovante
// enviado por WhatsApp às 14h").
export default function ObservacaoConfirmModal({
  titulo = 'Confirmar ação',
  mensagem,
  textoConfirmar = 'Confirmar',
  aoConfirmar,
  aoFechar,
  carregando = false,
}) {
  const [obs, setObs] = useState('')

  return (
    <Modal
      titulo={titulo}
      aoFechar={aoFechar}
      largura={440}
      rodape={
        <>
          <button type="button" className="btn btn-cd-secundario" onClick={aoFechar} disabled={carregando}>
            Cancelar
          </button>
          <button type="button" className="btn btn-cd-primario" onClick={() => aoConfirmar(obs)} disabled={carregando}>
            {carregando ? 'Aguarde...' : textoConfirmar}
          </button>
        </>
      }
    >
      <p style={{ fontSize: 13.5, marginBottom: 12, color: 'var(--cd-texto)' }}>{mensagem}</p>
      <label className="cd-label">Observação (opcional)</label>
      <textarea className="form-control" rows={2} placeholder="Ex.: comprovante recebido por WhatsApp..." value={obs} onChange={(e) => setObs(e.target.value)} />
    </Modal>
  )
}
