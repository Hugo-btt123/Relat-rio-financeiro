import * as clienteRepository from '../repositories/clienteRepository.js'
import * as debitoRepository from '../repositories/debitoRepository.js'
import * as notinhaRepository from '../repositories/notinhaRepository.js'

export async function buscaGlobal(texto: string) {
  const t = texto.trim().toLowerCase()
  if (!t) return { clientes: [], debitos: [], notinhas: [] }
  const semHash = t.replace('#', '')

  const clientes = await clienteRepository.listar({
    OR: [{ nome: { contains: t, mode: 'insensitive' } }, { cpf: { contains: t, mode: 'insensitive' } }],
  })

  const todosDebitos = await debitoRepository.listar({})
  const debitos = todosDebitos.filter((d) => {
    const numeroNotinha = d.notinhaId ? String(d.notinhaId) : ''
    return (
      d.descricao.toLowerCase().includes(t) ||
      d.competencia.toLowerCase().includes(t) ||
      d.cliente.nome.toLowerCase().includes(t) ||
      String(d.valor).includes(t) ||
      numeroNotinha.includes(semHash)
    )
  })

  const todasNotinhas = await notinhaRepository.listar({})
  const notinhas = todasNotinhas.filter((n) => {
    const numero = String(n.id).padStart(3, '0')
    return (
      n.cliente.nome.toLowerCase().includes(t) ||
      n.competencia.toLowerCase().includes(t) ||
      numero.includes(semHash) ||
      `#${numero}`.includes(t)
    )
  })

  return { clientes, debitos, notinhas }
}
