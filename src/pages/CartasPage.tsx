import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppWindow, BookOpen, Undo2, X } from 'lucide-react'
import { cartas as api, isCacheta, isTruco, type CardGame, type CartasRules, type TrucoVariant } from '@/lib/api-cartas'
import { useAuth } from '@/lib/auth-context'
import { useCartas } from '@/lib/cartas-context'
import { useLayout } from '@/lib/layout-context'
import { isPopout } from '@/lib/platform'
import { useCamadaVoltar } from '@/lib/use-camada-voltar'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { BackToHall } from '@/components/games/BackToHall'
import { GameIcon } from '@/components/social/GameIcon'
import { CartasLobby } from '@/components/cartas/CartasLobby'
import { TrucoTable } from '@/components/cartas/TrucoTable'
import { TrucoColinha } from '@/components/cartas/TrucoColinha'
import { CachetaTable } from '@/components/cartas/CachetaTable'
import { CachetaColinha } from '@/components/cartas/CachetaColinha'
import '@/components/poker/poker.css'

/**
 * TRUCO E CACHETA — uma TELA cada (`/truco`, `/cacheta`), no molde da tela
 * do pôquer: fundo com a luz do tema, o cabeçalho some com mesa aberta (a
 * área inteira é da mesa), a colinha numa gaveta do lado.
 *
 * O estado mora no cartas-context, acima das rotas: sair da tela não levanta
 * da mesa. Quem só ASSISTIA sai da sala ao sair da tela.
 */

const SUBTITLE: Record<CardGame, string> = {
  truco: 'Paulista ou mineiro, 1x1 ou em duplas · valendo murchos ou amistoso',
  cacheta: 'De 2 a 6, cada um por si · quem bate primeiro, o último de pé leva'
}

export function CartasPage({ game }: { game: CardGame }) {
  const { table, leaveTable, seatedAt, openTable, popoutOpen, focusPopout, bringBack } = useCartas()
  const { token } = useAuth()
  const { isPhone } = useLayout()
  const [params, setParams] = useSearchParams()
  const popout = isPopout()
  const [rules, setRules] = React.useState<CartasRules | null>(null)
  const [rulesOpen, setRulesOpen] = React.useState(false)
  const [lobbyVariant] = React.useState<TrucoVariant>('paulista')

  const closeRules = React.useCallback(() => setRulesOpen(false), [])
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

  // A mesa aberta é de outro jogo (veio de um link do truco pra tela da
  // cacheta, por exemplo): esta tela mostra o saguão dela, não a mesa alheia.
  const mine = table && table.game === game ? table : null

  // A janela própria chega com `?mesa=<id>`: abre e limpa a query.
  const mesaParam = params.get('mesa')
  React.useEffect(() => {
    if (!mesaParam) return
    void openTable(mesaParam)
    setParams(
      (p) => {
        p.delete('mesa')
        return p
      },
      { replace: true }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesaParam])

  // Sentado numa mesa DESTE jogo e sem mesa na tela: cai nela.
  React.useEffect(() => {
    if (seatedAt && seatedAt.game === game && !mine && popoutOpen !== game && !mesaParam) void openTable(seatedAt.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatedAt?.id, popoutOpen, game])

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

  const openRules = (): void => setRulesOpen(true)
  const title = game === 'truco' ? 'Truco' : 'Cacheta'
  const matchView = mine?.match ?? null

  return (
    <div className="poker-page relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div aria-hidden className="poker-page-fundo" />

      {!mine && (
        <header className="relative z-conteudo flex shrink-0 items-center gap-3 border-b border-line/70 px-4 py-3 sm:px-6">
          <GameIcon game={game} className="h-8 w-8 shrink-0 text-acid" />
          <div className="min-w-0 flex-1">
            <h1 className="title-brutal text-2xl leading-none">{title}</h1>
            <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{SUBTITLE[game]}</p>
          </div>
          {popout ? (
            <Button variant="outline" size="sm" onClick={() => void bringBack()}>
              <Undo2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Voltar pro launcher
            </Button>
          ) : (
            <BackToHall />
          )}
        </header>
      )}

      <div className="relative z-conteudo flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {popoutOpen === game && !mine ? (
            <div className="flex min-h-0 flex-1 items-center justify-center p-6">
              <div className="card-gradient flex w-full max-w-md flex-col items-center gap-3 rounded-brutal border-2 border-acid-dark p-6 text-center shadow-[0_20px_60px_rgb(0_0_0/0.6)]">
                <AppWindow className="h-8 w-8 text-acid" aria-hidden />
                <h2 className="text-base font-semibold text-foreground">A mesa está em outra janela</h2>
                <p className="text-[12.5px] text-muted-foreground">
                  Você abriu o {game} numa janela própria. Jogue por lá e use o launcher aqui — ou traga a mesa de volta.
                </p>
                <div className="mt-1 flex flex-wrap justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => void focusPopout()}>
                    <AppWindow className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Mostrar a janela
                  </Button>
                  <Button size="sm" onClick={() => void bringBack()}>
                    <Undo2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Trazer pra cá
                  </Button>
                </div>
              </div>
            </div>
          ) : mine ? (
            game === 'truco' ? (
              <TrucoTable onOpenRules={openRules} />
            ) : (
              <CachetaTable onOpenRules={openRules} />
            )
          ) : (
            <CartasLobby game={game} rules={rules} onOpenRules={openRules} />
          )}
        </div>

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
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3 pt-2">
                {game === 'truco' ? (
                  <TrucoColinha variant={mine?.variant ?? lobbyVariant} view={isTruco(matchView) ? matchView : null} />
                ) : (
                  <CachetaColinha view={isCacheta(matchView) ? matchView : null} />
                )}
              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  )
}
