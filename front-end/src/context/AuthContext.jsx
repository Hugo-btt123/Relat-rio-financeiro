import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import * as db from '../lib/db.js'

// Contexto responsável por saber "quem está logado" em qualquer parte do
// sistema. Qualquer componente pode chamar `useAutenticacao()` para ler o
// usuário atual ou chamar `entrar` / `sair`.
const ContextoAutenticacao = createContext(null)

export function ProvedorAutenticacao({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    db.usuarioAtual().then((u) => {
      setUsuario(u)
      setCarregando(false)
    })
  }, [])

  const entrar = useCallback(async (login, senha) => {
    const u = await db.entrar(login, senha)
    setUsuario(u)
    return u
  }, [])

  const sair = useCallback(async () => {
    await db.sair()
    setUsuario(null)
  }, [])

  return (
    <ContextoAutenticacao.Provider value={{ usuario, carregando, entrar, sair }}>
      {children}
    </ContextoAutenticacao.Provider>
  )
}

export function useAutenticacao() {
  const contexto = useContext(ContextoAutenticacao)
  if (!contexto) throw new Error('useAutenticacao precisa estar dentro de <ProvedorAutenticacao>')
  return contexto
}
