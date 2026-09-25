import { useEffect, useRef, useState } from 'react'
import * as db from '../../lib/db.js'

// Campo para escolher um cliente já cadastrado, digitando o nome e
// escolhendo da lista de sugestões — usado em todos os formulários de
// lançamento (Essencial, Lançamento em grupo, Nova notinha).
//
// Props:
//  - valorClienteId: id do cliente selecionado (ou null)
//  - aoSelecionar(cliente): chamado quando o usuário escolhe alguém
//  - placeholder
export default function ClienteAutocomplete({ valorClienteId, aoSelecionar, placeholder = 'Selecione um cliente...' }) {
  const [texto, setTexto] = useState('')
  const [sugestoes, setSugestoes] = useState([])
  const [aberto, setAberto] = useState(false)
  const [indiceAtivo, setIndiceAtivo] = useState(0)
  const ref = useRef(null)
  // Quando NÓS mesmos invalidamos a seleção (porque o usuário está
  // digitando), marcamos essa flag pra avisar o efeito de sincronização
  // abaixo "essa mudança pra null já era esperada, não apague o que a
  // pessoa acabou de digitar".
  const invalidacaoInterna = useRef(false)

  // Quando o id selecionado muda por fora (ex.: limpar formulário depois
  // de salvar, ou o formulário pai resetando), busca o nome correspondente
  // para exibir no campo de texto.
  useEffect(() => {
    if (invalidacaoInterna.current) {
      invalidacaoInterna.current = false
      return
    }
    let cancelado = false
    if (!valorClienteId) {
      setTexto('')
      return
    }
    db.buscarClientePorId(valorClienteId).then((c) => {
      if (!cancelado && c) setTexto(c.nome)
    })
    return () => { cancelado = true }
  }, [valorClienteId])

  useEffect(() => {
    function aoClicarFora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [])

  async function aoDigitar(valor) {
    setTexto(valor)
    setIndiceAtivo(0)
    // Qualquer edição no texto invalida a seleção anterior — sem isso, dava
    // pra selecionar "João Silva", apagar e digitar "Maria" sem escolher
    // ninguém na lista, e o formulário continuava silenciosamente usando o
    // João como cliente (o texto na tela não batia com quem seria
    // realmente lançado).
    invalidacaoInterna.current = true
    aoSelecionar?.(null)
    if (!valor.trim()) {
      setSugestoes([])
      setAberto(false)
      return
    }
    const lista = await db.buscarClientesPorNome(valor, 8)
    setSugestoes(lista)
    setAberto(true)
  }

  function escolher(cliente) {
    setTexto(cliente.nome)
    setAberto(false)
    aoSelecionar?.(cliente)
  }

  function aoTeclar(e) {
    if (!aberto || sugestoes.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndiceAtivo((i) => Math.min(i + 1, sugestoes.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndiceAtivo((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      escolher(sugestoes[indiceAtivo])
    }
  }

  return (
    <div className="cd-autocomplete" ref={ref}>
      <div className="input-group">
        <span className="input-group-text bg-white"><i className="bi bi-person" /></span>
        <input
          type="text"
          className="form-control"
          placeholder={placeholder}
          value={texto}
          onChange={(e) => aoDigitar(e.target.value)}
          onFocus={() => texto.trim() && setAberto(true)}
          onKeyDown={aoTeclar}
        />
      </div>
      {aberto && sugestoes.length > 0 && (
        <div className="cd-autocomplete__lista">
          {sugestoes.map((c, i) => (
            <div
              key={c.id}
              className={`cd-autocomplete__item${i === indiceAtivo ? ' destaque' : ''}`}
              onMouseDown={() => escolher(c)}
            >
              {c.nome}
              {(c.cpf || c.telefone) && <small>{[c.cpf, c.telefone].filter(Boolean).join(' · ')}</small>}
            </div>
          ))}
        </div>
      )}
      {aberto && texto.trim() && sugestoes.length === 0 && (
        <div className="cd-autocomplete__lista">
          <div className="cd-autocomplete__aviso">
            <i className="bi bi-info-circle me-1" />
            Nenhum cliente encontrado com esse nome. Cadastre-o na aba "Clientes".
          </div>
        </div>
      )}
    </div>
  )
}
