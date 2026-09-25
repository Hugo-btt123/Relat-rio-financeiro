import { RÓTULOS_STATUS } from '../../lib/format.js'

// Mostra o status de um débito ou notinha como uma "pilulazinha" colorida.
// `status` deve ser uma das chaves de RÓTULOS_STATUS (aberto, cobrado,
// pago, cancelado, ativa, paga, estornada).
export default function StatusBadge({ status, pixPendente = false }) {
  if (pixPendente) {
    return (
      <span className="cd-badge cd-badge--pix">
        <i className="bi bi-phone" /> Pix a conferir
      </span>
    )
  }

  const classePorStatus = {
    aberto: 'cd-badge--aberto',
    cobrado: 'cd-badge--cobrado',
    pago: 'cd-badge--pago',
    cancelado: 'cd-badge--cancelado',
    ativa: 'cd-badge--cobrado',
    paga: 'cd-badge--pago',
    estornada: 'cd-badge--cancelado',
    pix_a_conferir: 'cd-badge--pix',
  }

  return (
    <span className={`cd-badge ${classePorStatus[status] || 'cd-badge--neutro'}`}>
      {RÓTULOS_STATUS[status] || status}
    </span>
  )
}
