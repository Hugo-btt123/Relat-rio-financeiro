/* ==========================================================================
   Funções utilitárias de formatação — usadas em várias telas.
   ========================================================================== */

// Formata um número para moeda brasileira: 1234.5 -> "R$ 1.234,50"
export function formatarMoeda(valor) {
  const n = Number(valor) || 0
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Formata uma data ISO ("2026-06-20T12:00:00Z") para "20/06/2026"
export function formatarData(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

// Formata data + hora: "20/06/2026 14:32"
export function formatarDataHora(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const data = d.toLocaleDateString('pt-BR')
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${data} ${hora}`
}

// Uma data "yyyy-mm-dd" (vinda de <input type="date">) para "dd/mm/aaaa"
export function formatarDataCurta(yyyyMmDd) {
  if (!yyyyMmDd) return '—'
  const [ano, mes, dia] = yyyyMmDd.split('-')
  if (!ano || !mes || !dia) return yyyyMmDd
  return `${dia}/${mes}/${ano}`
}

// Aplica uma máscara simples enquanto o usuário digita a competência,
// no formato MM/AAAA (ex.: digitou "042026" -> mostra "04/2026").
export function mascararCompetencia(valorDigitado) {
  const numeros = valorDigitado.replace(/\D/g, '').slice(0, 6)
  if (numeros.length <= 2) return numeros
  return `${numeros.slice(0, 2)}/${numeros.slice(2)}`
}

// Valida se uma string está no formato MM/AAAA com mês entre 01 e 12.
export function competenciaValida(valor) {
  return /^(0[1-9]|1[0-2])\/\d{4}$/.test(valor || '')
}

// Aplica máscara de CPF (11 dígitos) OU CNPJ (14 dígitos) enquanto o
// usuário digita — decide sozinho qual formato usar pela quantidade de
// números já digitados. Até 11 dígitos vira CPF; a partir do 12º dígito
// passa a formatar como CNPJ.
export function mascararCpfCnpj(valorDigitado) {
  const numeros = valorDigitado.replace(/\D/g, '').slice(0, 14)
  if (numeros.length <= 11) {
    return numeros
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return numeros
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

// Mantida por compatibilidade — algumas telas antigas ainda podem chamar
// mascararCpf; hoje ela só delega para a versão CPF/CNPJ.
export function mascararCpf(valorDigitado) {
  return mascararCpfCnpj(valorDigitado)
}

// Aplica máscara simples de telefone (fixo ou celular).
export function mascararTelefone(valorDigitado) {
  const numeros = valorDigitado.replace(/\D/g, '').slice(0, 11)
  if (numeros.length <= 10) {
    return numeros.replace(/(\d{2})(\d{4})(\d{0,4})/, (m, a, b, c) => (c ? `(${a}) ${b}-${c}` : b ? `(${a}) ${b}` : `(${a}`))
  }
  return numeros.replace(/(\d{2})(\d{5})(\d{0,4})/, (m, a, b, c) => (c ? `(${a}) ${b}-${c}` : `(${a}) ${b}`))
}

// Texto amigável para cada status de débito/notinha.
export const RÓTULOS_STATUS = {
  aberto: 'Em aberto',
  cobrado: 'Cobrado',
  pago: 'Pago',
  cancelado: 'Cancelado',
  ativa: 'Ativa',
  paga: 'Paga',
  estornada: 'Estornada',
  pix_a_conferir: 'Pix a conferir',
}
