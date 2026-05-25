import * as React from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'

export function TitleBar() {
  const [maximized, setMaximized] = React.useState(false)

  React.useEffect(() => {
    void window.bocas.appWindow.isMaximized().then(setMaximized)
    const off = window.bocas.appWindow.onStateChanged((s) => setMaximized(s.maximized))
    return off
  }, [])

  return (
    <div
      className="app-drag relative flex h-9 shrink-0 items-center justify-between border-b border-[#1a1a1a] bg-[#0B0B0B] pl-3 pr-0 select-none"
      style={{
        backgroundImage:
          'linear-gradient(90deg, rgba(106,255,0,0.04) 0%, transparent 30%, transparent 70%, rgba(242,183,5,0.03) 100%)'
      }}
    >
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(106,255,0,0.35), transparent)'
        }}
      />

      <div className="flex items-center gap-2">
        <img
          src="/bocas-murchas-transp.png"
          alt=""
          aria-hidden
          className="h-5 w-5 drop-shadow-[0_0_6px_rgba(106,255,0,0.5)]"
        />
        <span className="font-display text-[11px] uppercase tracking-[0.2em] text-[#EAEAEA]">
          Bocas <span className="text-acid">Murchas</span>
        </span>
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          launcher
        </span>
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
      : 'hover:bg-[#1a1a1a] hover:text-acid'

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
