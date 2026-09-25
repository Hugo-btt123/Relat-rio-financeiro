import { useState } from 'react'
import Modal from './Modal.jsx'
import { formatarMoeda } from '../../lib/format.js'

// Monta as opções de destino disponíveis de acordo com o status atual do
// débito — segue exatamente a regra combinada:
//   "pago"    -> pode voltar para "Em aberto" ou "Cobrado"
//   "cobrado" (com ou sem Pix pendente) -> pode virar "Em aberto" ou "Pago"
//                (dinheiro ou Pix)
function opcoesParaStatus(debito) {
  if (debito.status === 'pago') {
    return [
      { chave: 'aberto', alvo: 'aberto', rotulo: 'Em aberto', icone: 'bi-arrow-counterclockwise' },
      {
        // Sem notinha, "Cobrado" só existe de verdade como "Pix a
        // conferir" — por isso `pix` precisa ser `true` nesse caso,
        // senão o débito fica num status "cobrado" solto que não aparece
        // em lugar nenhum do sistema.
        chave: 'cobrado', alvo: 'cobrado', pix: !debito.notinhaId,
        rotulo: debito.notinhaId ? 'Cobrado (continua na notinha)' : 'Cobrado (Pix a conferir)',
        icone: 'bi-receipt',
      },
    ]
  }
  // status === 'cobrado' (em notinha OU Pix avulso a conferir)
  return [
    { chave: 'aberto', alvo: 'aberto', rotulo: 'Em aberto', icone: 'bi-arrow-counterclockwise' },
    { chave: 'pago-dinheiro', alvo: 'pago', pix: false, rotulo: 'Pago (dinheiro)', icone: 'bi-cash-coin' },
    { chave: 'pago-pix', alvo: 'pago', pix: true, rotulo: 'Pago (Pix) — vai para conferência', icone: 'bi-phone' },
  ]
}

export default function AlterarStatusDebitoModal({ debito, aoConfirmar, aoFechar, carregando }) {
  const opcoes = opcoesParaStatus(debito)
  const [escolhida, setEscolhida] = useState(opcoes[0].chave)
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10))
  const [obs, setObs] = useState('')

  const opcaoAtual = opcoes.find((o) => o.chave === escolhida)

  function confirmar() {
    aoConfirmar({ alvo: opcaoAtual.alvo, pix: !!opcaoAtual.pix, dataPagamento: data, obs })
  }

  return (
    <Modal
      titulo="Alterar status do débito"
      subtitulo={`${debito.descricao} · ${formatarMoeda(debito.valor)} · ${debito.clienteNome}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn btn-cd-secundario" onClick={aoFechar} disabled={carregando}>Cancelar</button>
          <button className="btn btn-cd-primario" onClick={confirmar} disabled={carregando}>
            {carregando ? 'Aplicando...' : 'Aplicar alteração'}
          </button>
        </>
      }
    >
      {debito.notinhaId && (
        <div className="alert alert-warning py-2 d-flex align-items-start gap-2" style={{ fontSize: 12.5 }}>
          <i className="bi bi-exclamation-triangle-fill mt-1" />
          <span>
            Esse débito faz parte de uma notinha. A notinha será atualizada automaticamente (valores recalculados e
            um registro adicionado ao histórico dela) — ela não será apagada.
          </span>
        </div>
      )}

      <label className="cd-label">Novo status</label>
      <div className="d-flex flex-column gap-2 mb-3">
        {opcoes.map((o) => (
          <label
            key={o.chave}
            className="d-flex align-items-center gap-2"
            style={{
              border: '1px solid var(--cd-borda-forte)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontSize: 13.5,
              background: escolhida === o.chave ? 'var(--cd-azul-50)' : '#fff',
              borderColor: escolhida === o.chave ? 'var(--cd-azul-400)' : 'var(--cd-borda-forte)',
            }}
          >
            <input type="radio" name="status-alvo" checked={escolhida === o.chave} onChange={() => setEscolhida(o.chave)} />
            <i className={`bi ${o.icone}`} />
            {o.rotulo}
          </label>
        ))}
      </div>

      {opcaoAtual.alvo === 'pago' && !opcaoAtual.pix && (
        <div className="mb-3">
          <label className="cd-label">Data do pagamento</label>
          <input type="date" className="form-control" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
      )}

      <label className="cd-label">Observação (opcional)</label>
      <textarea className="form-control" rows={2} placeholder="Por que esse débito está sendo corrigido?" value={obs} onChange={(e) => setObs(e.target.value)} />
    </Modal>
  )
}
