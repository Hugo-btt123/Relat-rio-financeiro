// Guarda os últimos clientes visitados, só para mostrar atalhos rápidos na
// tela de Clientes ("recentes"). É uma conveniência de interface, não um
// dado "de verdade" do sistema — por isso fica fora do lib/db.js.
const CHAVE = 'crediario_digital_recentes_v1'
const LIMITE = 8

export function registrarAcessoCliente(clienteId) {
  const atual = listarIdsRecentes().filter((id) => id !== clienteId)
  atual.unshift(clienteId)
  localStorage.setItem(CHAVE, JSON.stringify(atual.slice(0, LIMITE)))
}

export function listarIdsRecentes() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) || '[]')
  } catch {
    return []
  }
}
