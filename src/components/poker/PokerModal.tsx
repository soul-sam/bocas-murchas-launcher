import * as React from 'react'
import { X } from 'lucide-react'
import { MurchosIcon } from '@/lib/bocas-icons'
import { formatCompact } from '@/lib/api-gamification'
import { poker as api, type HandCategory, type PokerRules } from '@/lib/api-poker'
import { useAuth } from '@/lib/auth-context'
import { useGamification } from '@/lib/gamification-context'
import { useLayout } from '@/lib/layout-context'
import { useOverlays } from '@/lib/overlay-context'
import { usePoker } from '@/lib/poker-context'
import { useFocusTrap } from '@/lib/use-focus-trap'
import { cn } from '@/lib/utils'
import { CashPanel } from './CashPanel'
import { HandRankings } from './HandRankings'
import { PokerIcon } from './PokerGlyphs'
import { PokerLobby } from './PokerLobby'
import { PokerTable } from './PokerTable'

/**
 * O PÔQUER — a camada de tela cheia: saguão, mesa, caixa e a colinha numa
 * gaveta do lado.
 *
 * Camada própria (div fixed), NÃO Radix Dialog, pelos motivos de sempre
 * (lib/interaction-guard.ts): abre da barra de ícones, do Ctrl+K, de um
 * comando de barra e de um card no chat — todos lugares que somem sozinhos.
 * Mora em GlobalOverlays, que só desmonta no logout.
 *
 * FECHAR A TELA NÃO LEVANTA DA MESA. Quem está sentado continua sentado, com
 * o relógio correndo; a barra de ícones mostra um aviso vermelho quando é a
 * vez da pessoa, e reabrir cai direto na mesa.
 */

type View = 'lobby' | 'cash'

export function PokerModal() {
  const { pokerOpen: open, pokerTableId, closePoker } = useOverlays()
  const { table, openTable, leaveTable, seatedAt } = usePoker()

  // Fechar a tela: quem está SENTADO continua na sala do socket (a mesa
  // segue, a barra avisa a vez); quem só assistia sai, pra não receber a
  // mesa inteira a cada jogada de uma tela que não está vendo.
  const close = React.useCallback(() => {
    if (table && table.mySeat === null) leaveTable()
    closePoker()
  }, [table, leaveTable, closePoker])
  const { token } = useAuth()
  const { profile } = useGamification()
  const { isPhone } = useLayout()

  const [rules, setRules] = React.useState<PokerRules | null>(null)
  const [view, setView] = React.useState<View>('lobby')
  const [rulesOpen, setRulesOpen] = React.useState(false)
  const [rulesHighlight, setRulesHighlight] = React.useState<HandCategory | null>(null)

  const closeAll = React.useCallback(() => {
    if (rulesOpen) {
      setRulesOpen(false)
      return
    }
    close()
  }, [rulesOpen, close])

  const panelRef = useFocusTrap<HTMLDivElement>(open, closeAll)

  // Regras do servidor (mesas disponíveis, se o caixa existe): uma vez por abertura.
  React.useEffect(() => {
    if (!open || !token) return
    let alive = true
    api
      .rules(token)
      .then((r) => alive && setRules(r))
      .catch(() => alive && setRules(null))
    return () => {
      alive = false
    }
  }, [open, token])

  // Veio de um card do chat (ou de "voltar pra mesa"): abre a mesa pedida.
  React.useEffect(() => {
    if (!open) return
    if (pokerTableId) void openTable(pokerTableId)
    // Sem mesa pedida mas sentado em uma: cai nela — é o que a pessoa quer.
    else if (seatedAt && !table) void openTable(seatedAt.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pokerTableId])

  React.useEffect(() => {
    if (!open) {
      setView('lobby')
      setRulesOpen(false)
    }
  }, [open])

  if (!open) return null

  const openRules = (category?: HandCategory | null): void => {
    setRulesHighlight(category ?? null)
    setRulesOpen(true)
  }

  return (
    <div
      className={cn('fixed inset-0 z-sobretela flex items-center justify-center bg-black/75', isPhone ? 'p-0' : 'p-4')}
      onClick={closeAll}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Pôquer"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'card-acid relative flex w-full flex-col overflow-hidden rounded-brutal',
          isPhone ? 'h-full max-w-full rounded-none' : 'h-[92dvh] max-w-6xl'
        )}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2.5">
          <PokerIcon className="h-6 w-6 text-acid" />
          <div className="min-w-0 flex-1">
            <h2 className="title-brutal text-lg leading-tight">Pôquer</h2>
            <p className="truncate text-[11.5px] text-muted-foreground">
              Texas Hold&apos;em sem limite · fichas são murchos
              {rules?.cashEnabled ? ' — ou, na mesa valendo, dinheiro de verdade até R$ 20' : ''}
            </p>
          </div>
          {profile && (
            <div className="hidden items-center gap-1.5 rounded-brutal border border-burn/60 bg-burn/10 px-3 py-1.5 font-mono text-sm text-burn sm:flex" title="Seus murchos">
              <MurchosIcon className="h-4 w-4" aria-hidden />
              {formatCompact(profile.coins)}
            </div>
          )}
          <button
            type="button"
            onClick={close}
            aria-label="Fechar"
            className="rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="relative flex min-h-0 flex-1">
          <div className="flex min-h-0 flex-1 flex-col">
            {table ? (
              <PokerTable onOpenRules={openRules} />
            ) : view === 'cash' ? (
              <CashPanel onBack={() => setView('lobby')} />
            ) : (
              <PokerLobby rules={rules} onOpenRules={() => openRules(null)} onOpenCash={() => setView('cash')} />
            )}
          </div>

          {/* A colinha, numa gaveta do lado (ou por cima, no celular). */}
          {rulesOpen && (
            <>
              {isPhone && <div className="absolute inset-0 z-veu bg-black/60" onClick={() => setRulesOpen(false)} aria-hidden />}
              <aside
                className={cn(
                  'flex flex-col border-line bg-void',
                  isPhone ? 'absolute inset-x-0 bottom-0 z-dialogo h-[80%] rounded-t-brutal border-t-2 border-acid-dark' : 'w-[400px] shrink-0 border-l'
                )}
              >
                <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
                  <h3 className="flex-1 text-sm font-semibold text-foreground">Colinha e regras</h3>
                  <button
                    type="button"
                    onClick={() => setRulesOpen(false)}
                    aria-label="Fechar a colinha"
                    className="rounded-brutal p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-2">
                  <HandRankings rules={rules} highlight={rulesHighlight} compact />
                </div>
              </aside>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
