import { useEffect } from 'react'
import { createPortal } from 'react-dom'

// Modal simples e genérico. Usar assim:
// <Modal titulo="Novo cliente" aoFechar={fechar} rodape={<botoes/>}>
//   ...conteúdo...
// </Modal>
export default function Modal({ titulo, subtitulo, aoFechar, children, rodape, largura = 520 }) {
  // Fecha com a tecla Esc, por conveniência.
  useEffect(() => {
    function aoTeclar(e) {
      if (e.key === 'Escape') aoFechar?.()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  return createPortal(
    <div className="cd-modal-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar?.() }}>
      <div className="cd-modal" style={{ maxWidth: largura }}>
        <div className="cd-modal__cabecalho">
          <div>
            <h5 style={{ fontSize: 17 }}>{titulo}</h5>
            {subtitulo && <div className="texto-suave" style={{ fontSize: 12.5, marginTop: 3 }}>{subtitulo}</div>}
          </div>
          <button type="button" className="cd-fechar" onClick={aoFechar} aria-label="Fechar">
            <i className="bi bi-x-lg" style={{ fontSize: 16 }} />
          </button>
        </div>
        <div className="cd-modal__corpo">{children}</div>
        {rodape && <div className="cd-modal__rodape">{rodape}</div>}
      </div>
    </div>,
    document.body
  )
}
