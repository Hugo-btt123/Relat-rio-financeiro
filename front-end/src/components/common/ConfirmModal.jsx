import Modal from './Modal.jsx'

// Modal de confirmação simples, usado antes de qualquer ação sensível
// (cancelar débito, estornar notinha, etc.) — o cliente pediu que o
// sistema sempre confirme antes de ações que não podem ser desfeitas.
export default function ConfirmModal({
  titulo = 'Confirmar ação',
  mensagem,
  textoConfirmar = 'Confirmar',
  variantePerigo = false,
  aoConfirmar,
  aoFechar,
  carregando = false,
}) {
  return (
    <Modal
      titulo={titulo}
      aoFechar={aoFechar}
      largura={420}
      rodape={
        <>
          <button type="button" className="btn btn-cd-secundario" onClick={aoFechar} disabled={carregando}>
            Cancelar
          </button>
          <button
            type="button"
            className={variantePerigo ? 'btn btn-cd-perigo' : 'btn btn-cd-primario'}
            onClick={aoConfirmar}
            disabled={carregando}
          >
            {carregando ? 'Aguarde...' : textoConfirmar}
          </button>
        </>
      }
    >
      <p style={{ fontSize: 13.5, margin: 0, color: 'var(--cd-texto)' }}>{mensagem}</p>
    </Modal>
  )
}
