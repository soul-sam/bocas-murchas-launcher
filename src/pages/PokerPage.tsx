import * as React from 'react'
import { BookOpen, X } from 'lucide-react'
import { poker as api, type HandCategory, type PokerRules } from '@/lib/api-poker'
import { useAuth } from '@/lib/auth-context'
import { useLayout } from '@/lib/layout-context'
import { usePoker } from '@/lib/poker-context'
import { useCamadaVoltar } from '@/lib/use-camada-voltar'
import { cn } from '@/lib/utils'
import { CashPanel } from '@/components/poker/CashPanel'
import { HandRankings } from '@/components/poker/HandRankings'
import { PokerIcon } from '@/components/poker/PokerGlyphs'
import { PokerLobby } from '@/components/poker/PokerLobby'
import { PokerTable } from '@/components/poker/PokerTable'
import '@/components/poker/poker.css'

/**
 * O PÔQUER É UMA TELA, não um modal — a rota `/poker`, do lado da aba do
 * Minecraft e da impressora.
 *
 * Nasceu como camada por cima do social e o Samu pediu imersão: uma mesa de
 * pôquer dentro de uma janelinha com o chat passando atrás não é uma mesa de
 * pôquer. Aqui a área inteira é dela: fundo com a luz do tema e uma textura
 * de feltro, o cabeçalho some quando há mesa aberta (só o feltro, os
 * assentos e a barra de ação), e a colinha abre numa gaveta do lado sem
 * cobrir o jogo.
 *
 * O estado (mesas, a mesa aberta, quem é a vez) continua no poker-context,
 * que mora acima das rotas: sair da tela não levanta da mesa — a barra de
 * ícones avisa quando é a sua vez, e voltar cai direto nela. Quem só
 * ASSISTIA sai da sala do socket ao sair da tela, pra não receber a mesa
 * inteira a cada jogada de uma tela que não está vendo.
 */

type View = 'lobby' | 'cash'

export function PokerPage() {
  const { table, leaveTable, seatedAt, openTable } = usePoker()
  const { token } = useAuth()
  const { isPhone } = useLayout()

  const [rules, setRules] = React.useState<PokerRules | null>(null)
  const [view, setView] = React.useState<View>('lobby')
  const [rulesOpen, setRulesOpen] = React.useState(false)
  const [rulesHighlight, setRulesHighlight] = React.useState<HandCategory | null>(null)

  const closeRules = React.useCallback(() => setRulesOpen(false), [])
  // O Voltar do celular fecha a colinha antes de pensar em sair da tela.
  useCamadaVoltar(isPhone && rulesOpen, closeRules)

  React.useEffect(() => {
    if (!token) return
    let alive = true
    api
      .rules(token)
      .then((r) => alive && setRules(r))
      .catch(() => alive && setRules(null))
    return () => {
      alive = false
    }
  }, [token])

  // Sentado numa mesa e sem mesa aberta na tela: cai nela. É o que a pessoa
  // quer ao voltar pra aba — não o saguão.
  React.useEffect(() => {
    if (seatedAt && !table) void openTable(seatedAt.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatedAt?.id])

  // Saindo da tela: quem só assistia sai da sala; quem está sentado fica.
  const tableRef = React.useRef(table)
  tableRef.current = table
  const leaveRef = React.useRef(leaveTable)
  leaveRef.current = leaveTable
  React.useEffect(
    () => () => {
      const t = tableRef.current
      if (t && t.mySeat === null) leaveRef.current()
    },
    []
  )

  React.useEffect(() => {
    if (!rulesOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeRules()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rulesOpen, closeRules])

  const openRules = (category?: HandCategory | null): void => {
    setRulesHighlight(category ?? null)
    setRulesOpen(true)
  }

  return (
    <div className="poker-page relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div aria-hidden className="poker-page-fundo" />

      {/* Cabeçalho só fora da mesa: com mesa aberta, a tela é dela. */}
      {!table && (
        <header className="relative z-conteudo flex shrink-0 items-center gap-3 border-b border-line/70 px-4 py-3 sm:px-6">
          <PokerIcon className="h-8 w-8 text-acid" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <h1 className="title-brutal text-2xl leading-none">Pôquer</h1>
            <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
              Texas Hold&apos;em sem limite · fichas são murchos
              {rules?.cashEnabled ? ' — ou, na mesa valendo, dinheiro de verdade até R$ 20' : ''}
            </p>
          </div>
        </header>
      )}

      <div className="relative z-conteudo flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1 flex-col">
          {view === 'cash' ? (
            // O caixa abre também de dentro da mesa (quem quebrou e precisa
            // depositar); "voltar" cai na mesa, se houver, senão no saguão.
            <CashPanel onBack={() => setView('lobby')} />
          ) : table ? (
            <PokerTable onOpenRules={openRules} onOpenCash={() => setView('cash')} />
          ) : (
            <PokerLobby rules={rules} onOpenRules={() => openRules(null)} onOpenCash={() => setView('cash')} />
          )}
        </div>

        {/* A colinha, numa gaveta do lado — por cima, no celular. */}
        {rulesOpen && (
          <>
            {isPhone && <div className="absolute inset-0 z-veu bg-black/60" onClick={closeRules} aria-hidden />}
            <aside
              className={cn(
                'flex flex-col border-line bg-void/95 backdrop-blur-sm',
                isPhone
                  ? 'absolute inset-x-0 bottom-0 z-dialogo h-[82%] rounded-t-brutal border-t-2 border-acid-dark'
                  : 'w-[420px] shrink-0 border-l'
              )}
              role="complementary"
              aria-label="Colinha e regras"
            >
              <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
                <BookOpen className="h-4 w-4 text-acid" aria-hidden />
                <h2 className="flex-1 text-sm font-semibold text-foreground">Colinha e regras</h2>
                <button
                  type="button"
                  onClick={closeRules}
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
  )
}
