import { useEffect, useRef, useState } from 'react'

// Menu de ações no estilo "três pontinhos" usado nas linhas das tabelas.
// Uso:
// <MenuAcoes itens={[
//   { rotulo: 'Editar', icone: 'bi-pencil', aoClicar: () => {} },
//   { separador: true },
//   { rotulo: 'Excluir', icone: 'bi-trash', perigo: true, aoClicar: () => {} },
// ]} />
export default function MenuAcoes({ itens }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function aoClicarFora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [])

  return (
    <div className="cd-acoes" ref={ref}>
      <button type="button" className="cd-acoes__botao" onClick={() => setAberto((v) => !v)} aria-label="Ações">
        <i className="bi bi-three-dots" />
      </button>
      {aberto && (
        <div className="cd-acoes__menu">
          {itens.map((item, i) =>
            item.separador ? (
              <div key={i} className="cd-acoes__separador" />
            ) : (
              <button
                key={i}
                type="button"
                className={`cd-acoes__item${item.perigo ? ' perigo' : ''}`}
                disabled={item.desabilitado}
                onClick={() => {
                  setAberto(false)
                  item.aoClicar?.()
                }}
              >
                {item.icone && <i className={`bi ${item.icone}`} />}
                {item.rotulo}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
