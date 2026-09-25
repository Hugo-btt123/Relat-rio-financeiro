import { createContext, useCallback, useContext, useState } from 'react'

// Sistema simples de "toasts" (avisos rápidos), usado para confirmar ações
// como "Débito lançado", "Notinha gerada", "Erro ao salvar", etc.
const ContextoToast = createContext(null)

export function ProvedorToast({ children }) {
  const [lista, setLista] = useState([])

  const remover = useCallback((id) => {
    setLista((atual) => atual.filter((t) => t.id !== id))
  }, [])

  const notificar = useCallback((mensagem, tipo = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setLista((atual) => [...atual, { id, mensagem, tipo }])
    setTimeout(() => remover(id), 3600)
  }, [remover])

  return (
    <ContextoToast.Provider value={{ notificar }}>
      {children}
      <div className="cd-toasts">
        {lista.map((t) => (
          <div key={t.id} className={`cd-toast ${t.tipo}`}>
            {t.tipo === 'sucesso' && <i className="bi bi-check-circle-fill" />}
            {t.tipo === 'erro' && <i className="bi bi-x-circle-fill" />}
            {t.tipo === 'aviso' && <i className="bi bi-exclamation-triangle-fill" />}
            <span>{t.mensagem}</span>
          </div>
        ))}
      </div>
    </ContextoToast.Provider>
  )
}

export function useToast() {
  const contexto = useContext(ContextoToast)
  if (!contexto) throw new Error('useToast precisa estar dentro de <ProvedorToast>')
  return contexto
}
