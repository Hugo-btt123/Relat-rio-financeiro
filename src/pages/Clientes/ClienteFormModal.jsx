import { useEffect, useState } from 'react'
import Modal from '../../components/common/Modal.jsx'
import * as db from '../../lib/db.js'
import { mascararCpfCnpj, mascararTelefone } from '../../lib/format.js'
import { useAutenticacao } from '../../context/AuthContext.jsx'

// Modal de "Novo cliente" (ou edição, se `clienteExistente` for passado).
// Enquanto o usuário digita o nome, mostramos os clientes já cadastrados
// com nome parecido — assim ele não cria "João Silva" duas vezes sem
// perceber.
export default function ClienteFormModal({ clienteExistente, aoSalvar, aoFechar, carregando }) {
  const { usuario } = useAutenticacao()
  const ehAdministrador = usuario?.papel === 'administrador'

  const [nome, setNome] = useState(clienteExistente?.nome || '')
  const [cpf, setCpf] = useState(clienteExistente?.cpf || '')
  const [telefone, setTelefone] = useState(clienteExistente?.telefone || '')
  const [observacoes, setObservacoes] = useState(clienteExistente?.observacoes || '')
  const [status, setStatus] = useState(clienteExistente?.status || 'ativo')
  const [honorarioEscritorio, setHonorarioEscritorio] = useState(clienteExistente?.honorarioEscritorio || '')
  const [parecidos, setParecidos] = useState([])
  const [erro, setErro] = useState('')

  useEffect(() => {
    let cancelado = false
    if (!nome.trim() || nome.trim().length < 2) {
      setParecidos([])
      return
    }
    db.buscarClientesPorNome(nome, 5).then((lista) => {
      if (cancelado) return
      // não mostra "parecido" se for exatamente o cliente que já estamos editando
      setParecidos(lista.filter((c) => c.id !== clienteExistente?.id))
    })
    return () => { cancelado = true }
  }, [nome, clienteExistente])

  function aoClicarSalvar() {
    if (!nome.trim()) return setErro('O nome é obrigatório.')
    setErro('')
    const dados = { nome, cpf, telefone, observacoes, status }
    // Só manda o valor do honorário se quem está salvando for administrador
    // — assim um funcionário nunca consegue alterar (nem apagar sem querer)
    // esse campo, mesmo manipulando o formulário.
    if (ehAdministrador) dados.honorarioEscritorio = honorarioEscritorio === '' ? 0 : Number(honorarioEscritorio)
    aoSalvar(dados)
  }

  return (
    <Modal
      titulo={clienteExistente ? 'Editar cliente' : 'Novo cliente'}
      subtitulo="Só o nome é obrigatório. O resto você completa quando precisar."
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn btn-cd-secundario" onClick={aoFechar} disabled={carregando}>Cancelar</button>
          <button className="btn btn-cd-primario" onClick={aoClicarSalvar} disabled={carregando}>
            {carregando ? 'Salvando...' : clienteExistente ? 'Salvar alterações' : 'Cadastrar'}
          </button>
        </>
      }
    >
      {erro && <div className="alert alert-danger py-2" style={{ fontSize: 13 }}>{erro}</div>}

      <div className="mb-3">
        <label className="cd-label">Nome *</label>
        <input type="text" className="form-control" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} />
        {parecidos.length > 0 && (
          <div className="cd-card mt-2" style={{ borderColor: 'var(--cd-dourado-300)' }}>
            <div className="cd-card__corpo" style={{ padding: '8px 12px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cd-dourado-700)' }}>
                <i className="bi bi-exclamation-triangle me-1" />
                Já existe(m) cliente(s) parecido(s) — confira antes de cadastrar de novo:
              </div>
              <ul className="mb-0 mt-1" style={{ fontSize: 12.5, paddingLeft: 18 }}>
                {parecidos.map((c) => (
                  <li key={c.id}>{c.nome} {c.cpf && <span className="texto-fraco">· {c.cpf}</span>}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="row g-3">
        <div className="col-6">
          <label className="cd-label">CPF/CNPJ</label>
          <input type="text" className="form-control" placeholder="CPF ou CNPJ (opcional)" value={cpf} onChange={(e) => setCpf(mascararCpfCnpj(e.target.value))} />
        </div>
        <div className="col-6">
          <label className="cd-label">Telefone</label>
          <input type="text" className="form-control" placeholder="(16) 99998-8888" value={telefone} onChange={(e) => setTelefone(mascararTelefone(e.target.value))} />
        </div>
        <div className="col-12">
          <label className="cd-label">Observações</label>
          <textarea className="form-control" rows={2} placeholder="opcional" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </div>
        {clienteExistente && (
          <div className="col-6">
            <label className="cd-label">Status</label>
            <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>
        )}
        {ehAdministrador && (
          <div className={clienteExistente ? 'col-6' : 'col-12'}>
            <label className="cd-label">
              <i className="bi bi-lock me-1" style={{ fontSize: 11 }} />
              Honorário do Escritório (R$)
            </label>
            <input
              type="number" min="0" step="0.01" className="form-control num"
              placeholder="0,00 (opcional)"
              value={honorarioEscritorio}
              onChange={(e) => setHonorarioEscritorio(e.target.value)}
            />
            <div className="texto-fraco mt-1" style={{ fontSize: 11 }}>
              Valor fixo que entra automaticamente em toda notinha nova desse cliente (dá pra tirar em cada notinha,
              se precisar). Só o administrador vê e altera esse campo.
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
