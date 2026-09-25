import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import * as db from '../../lib/db.js'
import { useToast } from '../../context/ToastContext.jsx'
import { useAutenticacao } from '../../context/AuthContext.jsx'
import ConfirmModal from '../../components/common/ConfirmModal.jsx'

// Baixa um arquivo qualquer gerado em memória (Blob) — função pequena e
// genérica, reaproveitada tanto para o .json quanto para o .xlsx.
function baixarArquivo(conteudo, nomeArquivo, tipoMime) {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipoMime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function carimboDataHora() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

// O SheetJS não sabe montar o cabeçalho de uma planilha a partir de uma
// lista vazia (não tem nenhuma linha pra "adivinhar" as colunas) — o que
// geraria uma aba sem estrutura nenhuma. Isso é bem fácil de acontecer na
// prática: num sistema novo, sem nenhum cliente ainda, um clique em
// "Baixar .xlsx" já teria as 5 abas vazias. Por isso, quando não há
// nenhuma linha, colocamos uma linha "molde" só com o cabeçalho e os
// valores em branco, garantindo que a aba sempre abre certinho no Excel.
function linhasOuCabecalho(linhas, colunas) {
  if (linhas.length > 0) return linhas
  return [colunas.reduce((linha, coluna) => ({ ...linha, [coluna]: '' }), {})]
}

// Lê um arquivo escolhido pelo usuário como texto (usado para ler o .json
// selecionado no <input type="file">).
function lerArquivoComoTexto(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onload = () => resolve(leitor.result)
    leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'))
    leitor.readAsText(arquivo, 'utf-8')
  })
}

export default function BackupPage() {
  const { notificar } = useToast()
  const { usuario } = useAutenticacao()
  const ehAdministrador = usuario?.papel === 'administrador'
  const inputArquivoRef = useRef(null)

  const [gerandoJson, setGerandoJson] = useState(false)
  const [gerandoExcel, setGerandoExcel] = useState(false)
  const [restaurando, setRestaurando] = useState(false)
  const [backupSelecionado, setBackupSelecionado] = useState(null) // { arquivo, dados } aguardando confirmação

  async function aoExportarJson() {
    setGerandoJson(true)
    try {
      const dados = await db.exportarBackupCompleto()
      baixarArquivo(JSON.stringify(dados, null, 2), `crediario-backup-${carimboDataHora()}.json`, 'application/json')
      notificar('Backup em .json baixado com sucesso.', 'sucesso')
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setGerandoJson(false)
    }
  }

  async function aoExportarExcel() {
    setGerandoExcel(true)
    try {
      const dados = await db.obterDadosParaExportacao()
      const planilha = XLSX.utils.book_new()

      const abaClientes = XLSX.utils.json_to_sheet(
        linhasOuCabecalho(dados.clientes.map((c) => ({
          Nome: c.nome, CPF: c.cpf, Telefone: c.telefone, Status: c.status,
          Observações: c.observacoes, 'Cadastrado em': c.criadoEm,
        })), ['Nome', 'CPF', 'Telefone', 'Status', 'Observações', 'Cadastrado em'])
      )
      XLSX.utils.book_append_sheet(planilha, abaClientes, 'Clientes')

      const abaDebitos = XLSX.utils.json_to_sheet(
        linhasOuCabecalho(dados.debitos.map((d) => ({
          Cliente: d.clienteNome, Propriedade: d.propriedadeNome || '', Descrição: d.descricao,
          Valor: d.valor, Competência: d.competencia, Status: d.status,
          'Pix a conferir': d.pixPendente ? 'Sim' : 'Não', Notinha: d.notinhaId ? 'sim' : '',
          'Forma de pagamento': d.formaPagamento || '', 'Data de pagamento': d.dataPagamento || '',
          Observação: d.observacao || '', 'Observação do pagamento': d.obsPagamento || '',
          'Criado em': d.criadoEm, 'Criado por': d.criadoPor,
        })), ['Cliente', 'Propriedade', 'Descrição', 'Valor', 'Competência', 'Status', 'Pix a conferir', 'Notinha', 'Forma de pagamento', 'Data de pagamento', 'Observação', 'Observação do pagamento', 'Criado em', 'Criado por'])
      )
      XLSX.utils.book_append_sheet(planilha, abaDebitos, 'Débitos')

      const abaNotinhas = XLSX.utils.json_to_sheet(
        linhasOuCabecalho(dados.notinhas.map((n) => ({
          Número: n.numero, Cliente: n.clienteNome, Competência: n.competencia,
          'Qtd. itens': n.quantidadeItens, Total: n.total, Pago: n.totalPago,
          'Aguardando Pix': n.totalPixPendente, 'Em aberto': n.totalAberto, Status: n.status,
          'Criada em': n.criadoEm, 'Criada por': n.criadoPor, Observações: n.observacoes,
        })), ['Número', 'Cliente', 'Competência', 'Qtd. itens', 'Total', 'Pago', 'Aguardando Pix', 'Em aberto', 'Status', 'Criada em', 'Criada por', 'Observações'])
      )
      XLSX.utils.book_append_sheet(planilha, abaNotinhas, 'Notinhas')

      const abaItensNotinha = XLSX.utils.json_to_sheet(
        linhasOuCabecalho(dados.notinhaItens.map((i) => ({
          Notinha: i.notinha, Cliente: i.clienteNome, Descrição: i.descricao,
          Propriedade: i.propriedadeNome || '', Competência: i.competencia, Valor: i.valor, Status: i.status,
        })), ['Notinha', 'Cliente', 'Descrição', 'Propriedade', 'Competência', 'Valor', 'Status'])
      )
      XLSX.utils.book_append_sheet(planilha, abaItensNotinha, 'Itens de notinha')

      const abaHistorico = XLSX.utils.json_to_sheet(
        linhasOuCabecalho(dados.historico.map((h) => ({
          Quando: h.quando, Entidade: h.entidade, Ação: h.acao, Detalhes: h.detalhes,
          Operador: h.operador, Referência: h.entidadeLabel,
        })), ['Quando', 'Entidade', 'Ação', 'Detalhes', 'Operador', 'Referência'])
      )
      XLSX.utils.book_append_sheet(planilha, abaHistorico, 'Histórico')

      const bytes = XLSX.write(planilha, { bookType: 'xlsx', type: 'array' })
      baixarArquivo(new Blob([bytes]), `crediario-backup-${carimboDataHora()}.xlsx`, 'application/octet-stream')
      notificar('Planilha .xlsx baixada com sucesso.', 'sucesso')
    } catch (erro) {
      notificar(erro.message, 'erro')
    } finally {
      setGerandoExcel(false)
    }
  }

  // Passo 1: usuário escolhe o arquivo .json no seletor do sistema. A gente
  // só lê e valida o conteúdo aqui — nada é gravado ainda, por isso pede
  // confirmação antes (é uma ação que substitui os dados atuais).
  async function aoEscolherArquivo(evento) {
    const arquivo = evento.target.files?.[0]
    evento.target.value = '' // permite escolher o mesmo arquivo de novo depois, se precisar
    if (!arquivo) return
    try {
      const texto = await lerArquivoComoTexto(arquivo)
      const dados = JSON.parse(texto)
      if (dados?.tipo !== 'crediario-digital-backup') {
        notificar('Esse arquivo não parece ser um backup do Crediário Digital.', 'erro')
        return
      }
      setBackupSelecionado({ arquivo, dados })
    } catch (erro) {
      notificar('Não foi possível ler esse arquivo como um backup válido (.json).', 'erro')
    }
  }

  // Passo 2: só depois de confirmar no modal é que os dados são realmente
  // substituídos.
  async function aoConfirmarRestauracao() {
    setRestaurando(true)
    try {
      await db.restaurarBackupCompleto(backupSelecionado.dados)
      notificar('Backup restaurado com sucesso! Recarregando o sistema...', 'sucesso')
      setBackupSelecionado(null)
      // Recarrega a página inteira para que todas as telas voltem a
      // buscar os dados já restaurados, sem nenhuma tela ficar com
      // informação antiga em memória.
      setTimeout(() => window.location.assign('/essencial'), 900)
    } catch (erro) {
      notificar(erro.message, 'erro')
      setRestaurando(false)
    }
  }

  return (
    <div>
      <div className="cd-pagina__cabecalho">
        <h1>Backup</h1>
        <p className="cd-pagina__subtitulo">Exporte, guarde e restaure uma cópia de segurança de todos os dados do sistema.</p>
      </div>

      <div className="row g-3" style={{ maxWidth: 760 }}>
        <div className="col-md-6">
          <div className="cd-card h-100">
            <div className="cd-card__corpo d-flex flex-column">
              <div style={{ fontSize: 26 }}><i className="bi bi-filetype-json" style={{ color: 'var(--cd-azul-600)' }} /></div>
              <strong style={{ fontSize: 15, marginTop: 8 }}>Backup completo (.json)</strong>
              <p className="texto-suave" style={{ fontSize: 13, marginTop: 4, flex: 1 }}>
                Uma cópia bruta e completa de tudo — clientes, débitos, notinhas e histórico. Esse é o arquivo que
                pode ser <strong>restaurado</strong> depois, aqui mesmo nesta tela.
              </p>
              <button className="btn btn-cd-primario" onClick={aoExportarJson} disabled={gerandoJson}>
                <i className="bi bi-download me-1" /> {gerandoJson ? 'Gerando...' : 'Baixar .json'}
              </button>
            </div>
          </div>
        </div>

        <div className="col-md-6">
          <div className="cd-card h-100">
            <div className="cd-card__corpo d-flex flex-column">
              <div style={{ fontSize: 26 }}><i className="bi bi-file-earmark-excel" style={{ color: 'var(--cd-verde)' }} /></div>
              <strong style={{ fontSize: 15, marginTop: 8 }}>Planilha detalhada (.xlsx)</strong>
              <p className="texto-suave" style={{ fontSize: 13, marginTop: 4, flex: 1 }}>
                Uma planilha do Excel com abas separadas — Clientes, Débitos, Notinhas, Itens de notinha e Histórico —
                fácil de abrir, filtrar e conferir manualmente. <strong>Não</strong> serve para restaurar (é só leitura).
              </p>
              <button className="btn btn-cd-ouro" onClick={aoExportarExcel} disabled={gerandoExcel}>
                <i className="bi bi-download me-1" /> {gerandoExcel ? 'Gerando...' : 'Baixar .xlsx'}
              </button>
            </div>
          </div>
        </div>

        {ehAdministrador && (
          <div className="col-12">
            <div className="cd-card" style={{ borderColor: 'var(--cd-dourado-300)' }}>
              <div className="cd-card__corpo d-flex flex-column">
                <div style={{ fontSize: 26 }}><i className="bi bi-upload" style={{ color: 'var(--cd-dourado-700)' }} /></div>
                <strong style={{ fontSize: 15, marginTop: 8 }}>Restaurar backup</strong>
                <p className="texto-suave" style={{ fontSize: 13, marginTop: 4 }}>
                  Escolha um arquivo <code>.json</code> baixado anteriormente nesta mesma tela para trazer aqueles
                  dados de volta. <strong>Isso substitui</strong> os clientes, débitos, notinhas e histórico atuais —
                  por isso pedimos confirmação antes de aplicar.
                </p>
                <input
                  ref={inputArquivoRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={aoEscolherArquivo}
                  style={{ display: 'none' }}
                />
                <button className="btn btn-cd-secundario" style={{ alignSelf: 'flex-start' }} onClick={() => inputArquivoRef.current?.click()}>
                  <i className="bi bi-folder2-open me-1" /> Escolher arquivo de backup...
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {!ehAdministrador && (
        <div className="texto-fraco mt-2" style={{ fontSize: 12, maxWidth: 760 }}>
          <i className="bi bi-lock me-1" />
          A restauração de backup é uma ação só do administrador.
        </div>
      )}

      <div className="texto-fraco mt-3" style={{ fontSize: 12, maxWidth: 760 }}>
        <i className="bi bi-info-circle me-1" />
        Recomendamos fazer esse backup periodicamente (ex.: uma vez por semana) enquanto o sistema estiver rodando só
        no navegador. Depois que os dados estiverem no banco de verdade (PostgreSQL, via Prisma), o próprio banco já
        mantém histórico e segurança — mas os backups continuam sendo uma boa prática.
      </div>

      {backupSelecionado && (
        <ConfirmModal
          titulo="Restaurar este backup?"
          mensagem={`O arquivo "${backupSelecionado.arquivo.name}" (backup gerado em ${
            backupSelecionado.dados.geradoEm ? new Date(backupSelecionado.dados.geradoEm).toLocaleString('pt-BR') : 'data desconhecida'
          }) vai SUBSTITUIR todos os clientes, débitos, notinhas e histórico atuais do sistema. Seus usuários e login continuam os mesmos. Essa ação não pode ser desfeita — se tiver dúvida, baixe um backup do estado atual antes de continuar.`}
          textoConfirmar="Restaurar e substituir tudo"
          variantePerigo
          carregando={restaurando}
          aoFechar={() => setBackupSelecionado(null)}
          aoConfirmar={aoConfirmarRestauracao}
        />
      )}
    </div>
  )
}
