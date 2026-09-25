const REGEX_COMPETENCIA = /^(0[1-9]|1[0-2])\/\d{4}$/

export function competenciaValida(competencia: string): boolean {
  return REGEX_COMPETENCIA.test(competencia)
}
