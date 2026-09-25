import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAutenticacao } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'

// Tela de login — pede nome de usuário e senha. Não há cadastro público:
// o administrador cria os usuários (por enquanto, direto no arquivo
// src/lib/db.js, na função bancoPadrao — isso será substituído por uma
// tela de administração quando o back-end existir).
export default function LoginPage() {
  const { entrar, usuario } = useAutenticacao()
  const { notificar } = useToast()
  const navegar = useNavigate()
  const local = useLocation()

  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (usuario) {
    navegar('/', { replace: true })
    return null
  }

  async function aoEnviar(e) {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await entrar(login, senha)
      notificar('Bem-vindo(a) de volta!', 'sucesso')
      const destino = local.state?.de || '/essencial'
      navegar(destino, { replace: true })
    } catch (err) {
      setErro(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(160deg, var(--cd-azul-950), var(--cd-azul-800))',
        padding: 16,
      }}
    >
      <div className="cd-card" style={{ width: 400 }}>
        <div className="cd-card__corpo" style={{ padding: '32px 30px' }}>
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <div
              style={{
                width: 52, height: 52, borderRadius: 14, margin: '0 auto 12px',
                background: 'var(--cd-dourado-500)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: 'var(--cd-azul-950)', fontSize: 24,
              }}
            >
              <i className="bi bi-journal-bookmark-fill" />
            </div>
            <h1 style={{ fontSize: 22 }}>Crediário Digital</h1>
            <p className="texto-suave" style={{ fontSize: 13, marginTop: 6 }}>
              Entre com seu usuário e senha. Se ainda não tem conta, peça para o administrador criar uma para você.
            </p>
          </div>

          <form onSubmit={aoEnviar}>
            <div className="mb-3">
              <label className="cd-label">Usuário</label>
              <input
                type="text"
                className="form-control"
                placeholder="ex.: admin"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="mb-3">
              <label className="cd-label">Senha</label>
              <input
                type="password"
                className="form-control"
                placeholder="Sua senha"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </div>

            {erro && (
              <div className="alert alert-danger py-2" style={{ fontSize: 13 }}>
                {erro}
              </div>
            )}

            <button type="submit" className="btn btn-cd-primario w-100 py-2" disabled={enviando}>
              {enviando ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div className="text-center texto-fraco" style={{ fontSize: 11.5, marginTop: 18 }}>
            Demonstração: usuário <strong>admin</strong> / senha <strong>admin123</strong>
          </div>
        </div>
      </div>
    </div>
  )
}
