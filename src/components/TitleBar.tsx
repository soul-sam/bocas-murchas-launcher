import * as React from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'
import { UpdatePill } from '@/components/UpdatePill'
import { useUpdater } from '@/lib/updater-context'
import { isWeb } from '@/lib/platform'

export function TitleBar() {
  const [maximized, setMaximized] = React.useState(false)
  const { status, check } = useUpdater()

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
        <img
          src="bocas-murchas-transp.png"
          alt=""
          aria-hidden
          className="h-5 w-5 drop-shadow-[0_0_6px_rgb(var(--neon-rgb)/0.3)]"
        />
        <span className="font-display text-[11px] uppercase tracking-[0.2em] text-foreground">
          Bocas <span className="text-acid-text">Murchas</span>
        </span>
        {/* A versao vira o botao de "procurar atualizacoes": e o lugar onde as
            pessoas ja olham quando querem saber se estao desatualizadas. */}
        <button
          type="button"
          onClick={() => void check()}
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
