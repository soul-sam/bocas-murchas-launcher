import * as React from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'
import { UpdatePill } from '@/components/UpdatePill'
import { useUpdater } from '@/lib/updater-context'
import { isWeb } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { emitEgg, onEgg, useTitleDecor } from '@/lib/easter-eggs/bus'
import { DecorButton } from '@/components/easter-eggs/DecorButton'

/**
 * Cliques na boca da barra que viram piada. O contador zera depois de 5 s
 * parado — cem cliques pedem paciência, não um cronômetro.
 */
const LOGO_JOKES: Record<number, { title: string; body?: string }> = {
  7: { title: '7 cliques', body: 'Número da sorte. Aposta nele.' },
  13: { title: '13 cliques', body: 'Corajoso.' },
  42: { title: '42', body: 'A resposta pra vida, o universo e tudo mais.' },
  69: { title: 'Nice.' }
}
const LOGO_IDLE_MS = 5_000
const LOGO_TARGET = 100
/** Cliques rápidos em "Murchas" que abrem o caderninho de ovos. */
const NOTEBOOK_CLICKS = 5

export function TitleBar() {
  const [maximized, setMaximized] = React.useState(false)
  const { status, check } = useUpdater()
  const decor = useTitleDecor()
  const [logoFx, setLogoFx] = React.useState<'gira' | 'murcha' | null>(null)
  const [straightened, setStraightened] = React.useState(false)
  const logoClicks = React.useRef({ count: 0, last: 0 })
  const wordClicks = React.useRef({ count: 0, last: 0 })

  // "murcho" digitado em qualquer tela murcha a boca aqui em cima.
  React.useEffect(
    () =>
      onEgg((event) => {
        if (event.type === 'run' && event.effect === 'murcho') setLogoFx('murcha')
      }),
    []
  )

  const clickLogo = (): void => {
    // Sexta-feira 13: a boca está torta, e endireitar é o ovo.
    if (decor === 'sexta-13' && !straightened) {
      setStraightened(true)
      emitEgg({ type: 'toast', title: 'Desentortou', body: 'Pelo menos a boca não ficou torta hoje.' })
      emitEgg({ type: 'found', id: 'sexta-13' })
      return
    }
    const now = Date.now()
    const clicks = logoClicks.current
    clicks.count = now - clicks.last > LOGO_IDLE_MS ? 1 : clicks.count + 1
    clicks.last = now
    const joke = LOGO_JOKES[clicks.count]
    if (joke) emitEgg({ type: 'toast', ...joke })
    if (clicks.count % 10 === 0) setLogoFx('gira')
    if (clicks.count === LOGO_TARGET) {
      emitEgg({ type: 'toast', title: '100 cliques', body: 'Você é persistente demais.' })
      emitEgg({ type: 'found', id: 'pica-pau' })
      clicks.count = 0
    }
  }

  const clickWord = (): void => {
    const now = Date.now()
    const clicks = wordClicks.current
    clicks.count = now - clicks.last > 1_500 ? 1 : clicks.count + 1
    clicks.last = now
    if (clicks.count === NOTEBOOK_CLICKS) {
      clicks.count = 0
      emitEgg({ type: 'notebook' })
    }
  }

  /**
   * A altura DESTA barra, publicada pra quem se ancora abaixo dela.
   *
   * A fila do topo (drops de admin, faixa de custos) vivia em `top-12` — 48px
   * pra uma barra que mede 36, e que na web nem existe, deixando uma faixa
   * morta acima de todo aviso. Agora a única fonte é esta: `h-9` = 36px no
   * Electron, 0 no navegador.
   */
  React.useEffect(() => {
    const altura = isWeb() ? '0px' : '36px'
    document.documentElement.style.setProperty('--altura-titulo', altura)
  }, [])

  React.useEffect(() => {
    void window.bocas.appWindow.isMaximized().then(setMaximized)
    const off = window.bocas.appWindow.onStateChanged((s) => setMaximized(s.maximized))
    return off
  }, [])

  // No navegador nao existe moldura de janela pra minimizar, maximizar ou
  // fechar, e a versao aqui era o botao de procurar atualizacao — que na web
  // e trabalho do service worker. A barra inteira perde sentido: some.
  //
  // O early return vem DEPOIS dos hooks de proposito: antes deles seria
  // chamada condicional de hook, e o React quebra na primeira vez que este
  // componente montasse nas duas plataformas.
  if (isWeb()) return null

  return (
    <div
      className="app-drag relative flex h-9 shrink-0 items-center justify-between border-b border-line bg-void pl-3 pr-0 select-none"
      style={{
        backgroundImage:
          'linear-gradient(90deg, rgb(var(--neon-rgb)/0.04) 0%, transparent 30%, transparent 70%, rgba(242,183,5,0.03) 100%)'
      }}
    >
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgb(var(--neon-rgb)/0.3), transparent)'
        }}
      />

      <div className="flex items-center gap-2">
        {/* A boca é clicável (e fora da área de arrastar, senão o Windows
            engole o clique): é onde moram os ovos da barra. */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={clickLogo}
          onAnimationEnd={() => setLogoFx(null)}
          className="app-no-drag flex h-5 w-5 items-center justify-center"
        >
          <img
            src="bocas-murchas-transp.png"
            alt=""
            className={cn(
              'h-5 w-5 drop-shadow-[0_0_6px_rgb(var(--neon-rgb)/0.3)]',
              logoFx === 'gira' && 'egg-logo-gira',
              logoFx === 'murcha' && 'egg-logo-murcha',
              decor === 'sexta-13' && !straightened && 'egg-logo-torta'
            )}
          />
        </button>
        <span className="font-display text-[11px] uppercase tracking-[0.2em] text-foreground">
          {decor === 'leet' ? (
            // 13:37 — por um minuto a barra fala h4ck3r.
            <>
              B0C45 <span className="text-acid-text">MURCH45</span>
            </>
          ) : (
            <>
              Bocas{' '}
              <span className="app-no-drag cursor-default text-acid-text" onClick={clickWord}>
                Murchas
              </span>
            </>
          )}
        </span>
        {decor && decor !== 'leet' && decor !== 'sexta-13' && <DecorButton decor={decor} />}
        {/* A versao vira o botao de "procurar atualizacoes": e o lugar onde as
            pessoas ja olham quando querem saber se estao desatualizadas. */}
        <button
          type="button"
          onClick={() => void check()}
          disabled={status.stage === 'checking' || status.stage === 'publishing'}
          title="Procurar atualizações"
          className="app-no-drag rounded-brutal px-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          v{status.currentVersion ?? '—'}
        </button>
      </div>

      <div className="app-no-drag ml-auto mr-2 flex items-center">
        <UpdatePill />
      </div>

      <div className="app-no-drag flex h-full items-stretch">
        <TitleBarButton
          label="Minimizar"
          onClick={() => void window.bocas.appWindow.minimize()}
        >
          <Minus className="h-3.5 w-3.5" />
        </TitleBarButton>
        <TitleBarButton
          label={maximized ? 'Restaurar' : 'Maximizar'}
          onClick={() => void window.bocas.appWindow.maximizeToggle()}
        >
          {maximized ? (
            <Copy className="h-3 w-3 -scale-x-100" />
          ) : (
            <Square className="h-3 w-3" />
          )}
        </TitleBarButton>
        <TitleBarButton
          label="Fechar"
          variant="danger"
          onClick={() => void window.bocas.appWindow.close()}
        >
          <X className="h-4 w-4" />
        </TitleBarButton>
      </div>
    </div>
  )
}

function TitleBarButton({
  children,
  onClick,
  label,
  variant
}: {
  children: React.ReactNode
  onClick: () => void
  label: string
  variant?: 'danger'
}) {
  const hover =
    variant === 'danger'
      ? 'hover:bg-destructive hover:text-destructive-foreground'
      : 'hover:bg-surface-raised hover:text-foreground'

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-full w-11 items-center justify-center text-muted-foreground transition-colors duration-100 ${hover}`}
    >
      {children}
    </button>
  )
}
