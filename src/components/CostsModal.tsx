import * as React from 'react'
import { Check, Copy, HandCoins, Loader2, Server, Undo2, X } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import { formatBRL, monthName } from '@/lib/api-costs'
import { useCosts } from '@/lib/costs-context'
import { useOverlays } from '@/lib/overlay-context'
import { cn } from '@/lib/utils'

/**
 * A CONTA DO GRUPO — quanto custa manter isto de pé, e quanto cabe a cada um.
 *
 * O launcher, o chat, as calls, a tela compartilhada e o servidor de Minecraft
 * moram num computador alugado. Isso sempre saiu do bolso de uma pessoa só, e
 * ninguém mais via o número — o que faz a ajuda depender de alguém ter coragem
 * de pedir toda vez. Esta tela é o número na mesa.
 *
 * O TEXTO É PROPOSITALMENTE SEM TERMO TÉCNICO. Ninguém precisa saber o que é
 * VPS pra entender que um computador ligado 24 horas por dia custa dinheiro.
 *
 * O QUE ELA NÃO FAZ: cobrar. Não há bloqueio, não há dívida e o "paguei" é na
 * palavra — some da tela até virar o mês e pronto. O empurrão é ver o número
 * dividido e quem já botou a parte dele; não é vergonha, é conta à vista.
 *
 * A chave Pix vem do SERVIDOR, nunca escrita aqui: este repositório é público
 * e a chave é um CPF (ver lib/api-costs.ts).
 *
 * Sem Radix, igual às outras camadas globais: um Dialog arrancado da árvore
 * aberto trava o `<body>` inteiro — ver lib/interaction-guard.ts.
 */
export function CostsModal() {
  const { costsOpen, closeCosts } = useOverlays()
  const { summary, markPaid, unmarkPaid } = useCosts()
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!costsOpen) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeCosts()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [costsOpen, closeCosts])

  if (!costsOpen || !summary) return null

  const toggle = async (): Promise<void> => {
    setBusy(true)
    try {
      await (summary.iPaid ? unmarkPaid() : markPaid())
    } catch {
      // Falhou: o botão volta ao que era e a pessoa tenta de novo. Um alerta
      // aqui seria pior que o silêncio — ela vê que não mudou.
    } finally {
      setBusy(false)
    }
  }

  const mes = monthName(summary.month)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={closeCosts}
    >
      <div
        className="card-acid relative flex max-h-full w-full max-w-lg flex-col rounded-brutal"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Fechar"
          onClick={closeCosts}
          className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex items-center gap-3">
            <Server className="h-7 w-7 shrink-0 text-burn" />
            <div className="min-w-0">
              <h2 className="title-brutal text-2xl">A conta do Bocas Murchas</h2>
              <p className="text-[11.5px] text-muted-foreground">
                Referente a {mes}
              </p>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-foreground">
            Tudo isso aqui — o chat, as calls, a tela compartilhada, o servidor
            de Minecraft, os clipes, as fotos, os sons — mora num computador
            alugado que fica ligado o dia inteiro, todo dia. Ele não é de graça.
          </p>

          <div className="mt-4 rounded-brutal border border-line bg-void/60 p-4">
            <p className="text-center text-[11.5px] text-muted-foreground">
              Custa por mês
            </p>
            <p className="text-center font-mono text-3xl font-bold text-burn">
              {formatBRL(summary.totalCents)}
            </p>
            <ul className="mt-3 space-y-1">
              {summary.items.map((item) => (
                <li
                  key={item}
                  className="flex gap-2 text-[11.5px] leading-snug text-muted-foreground"
                >
                  <span className="shrink-0 text-burn">·</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-foreground">
            Isso sai do bolso de uma pessoa só, todo mês, desde que o grupo
            existe.
          </p>

          <div className="mt-4 rounded-brutal border border-acid-dark bg-acid/[0.06] p-4">
            <p className="text-sm leading-relaxed text-foreground">
              Somos{' '}
              <span className="font-mono font-bold text-acid-text">
                {summary.activeUsers}
              </span>{' '}
              {summary.activeUsers === 1 ? 'pessoa usando' : 'pessoas usando'} de
              verdade neste mês. Rachando por igual, dá{' '}
              <span className="font-mono font-bold text-acid-text">
                {formatBRL(summary.shareCents)}
              </span>{' '}
              pra cada um.
            </p>
            <p className="mt-2 text-[11.5px] leading-snug text-muted-foreground">
              A divisão é só por quem apareceu nos últimos 30 dias — conta
              parada não entra na conta de ninguém.
            </p>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-foreground">
            Ninguém é obrigado a nada, ninguém vai ser bloqueado e ninguém vai
            ficar devendo. Mas se você entrou aqui hoje, foi porque o servidor
            estava de pé — e ele estava de pé porque alguém pagou por ele.
          </p>

          <PixKey value={summary.pixKey} />

          {/* A recompensa é conquista, e só. Murcho por um "paguei" que
              ninguém confere seria pagar pra mentir — ver lib/costs.ts na
              API. */}
          <p className="mt-4 rounded-brutal border border-burn/40 bg-burn/[0.06] px-3 py-2 text-[11.5px] leading-snug text-foreground">
            Quem ajuda leva a conquista <strong className="font-medium">Paga o Boleto</strong> 🧾 no
            perfil — e <strong className="font-medium">Sustenta o Rolê</strong> 🏛️ depois de ajudar
            em três meses.
          </p>

          <Contributors summary={summary} />
        </div>

        <div className="shrink-0 border-t border-line p-4">
          <button
            type="button"
            onClick={() => void toggle()}
            disabled={busy}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-brutal px-3 py-2 text-sm transition-colors',
              summary.iPaid
                ? 'border border-line text-muted-foreground hover:text-foreground'
                : 'btn-acid',
              busy && 'cursor-not-allowed opacity-60'
            )}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : summary.iPaid ? (
              <Undo2 className="h-4 w-4" />
            ) : (
              <HandCoins className="h-4 w-4" />
            )}
            {summary.iPaid ? 'Marquei sem querer, desfazer' : 'Já paguei a minha parte'}
          </button>
          <p className="mt-2 text-center text-[11.5px] leading-snug text-muted-foreground">
            {summary.iPaid
              ? `Valeu. Não te cobro de novo até virar o mês.`
              : 'É na palavra: marcar aqui só tira o aviso da sua tela até virar o mês.'}
          </p>
        </div>
      </div>
    </div>
  )
}

/** A chave, grande e com botão de copiar — é o que a pessoa veio buscar. */
function PixKey({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2_000)
    return () => clearTimeout(timer)
  }, [copied])

  if (!value) {
    return (
      <p className="mt-4 rounded-brutal border border-burn/40 bg-burn/10 p-3 text-[11.5px] leading-snug text-burn">
        A chave Pix ainda não foi configurada no servidor. Fala com o Samu.
      </p>
    )
  }

  const copy = (): void => {
    navigator.clipboard
      .writeText(value)
      .then(() => setCopied(true))
      .catch(() => {
        // Sem área de transferência: a chave está na tela e dá pra digitar.
      })
  }

  return (
    <div className="mt-4">
      <p className="mb-1 text-[11.5px] text-muted-foreground">Pix</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-brutal border border-line bg-void px-3 py-2 font-mono text-base text-foreground">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label="Copiar a chave Pix"
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-brutal border px-3 py-2 text-xs transition-colors',
            copied
              ? 'border-acid-dark text-acid-text'
              : 'border-line text-muted-foreground hover:border-burn/60 hover:text-foreground'
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'copiado' : 'copiar'}
        </button>
      </div>
    </div>
  )
}

/**
 * Quem já ajudou no mês. É a parte que faz o empurrão sem ofender ninguém:
 * mostra quem botou, e não quem faltou.
 */
function Contributors({ summary }: { summary: ReturnType<typeof useCosts>['summary'] }) {
  if (!summary) return null
  const { contributors, activeUsers, month } = summary

  return (
    <div className="mt-5">
      <h3 className="mb-2 text-[11.5px] text-muted-foreground">
        Já ajudaram em {monthName(month)} — {contributors.length} de {activeUsers}
      </h3>

      {contributors.length === 0 ? (
        <p className="rounded-brutal border border-line bg-void/60 px-3 py-2 text-[11.5px] leading-snug text-muted-foreground">
          Ninguém ainda este mês. Dá pra ser o primeiro.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {contributors.map((person) => (
            <li
              key={person.userId}
              className="flex items-center gap-1.5 rounded-brutal border border-acid-dark bg-acid/[0.06] py-1 pl-1 pr-2.5"
            >
              <UserAvatar
                src={resolveAssetUrl(person.avatar)}
                name={person.displayName}
                userId={person.userId}
                className="h-5 w-5"
              />
              <span className="text-xs text-foreground">{person.displayName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
