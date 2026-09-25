export function arredondar(valor: number | string): number {
  return Number((Number(valor) || 0).toFixed(2))
}
