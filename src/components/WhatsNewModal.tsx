import * as React from 'react'
import { Info, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/lib/settings-context'
import { useOverlays } from '@/lib/overlay-context'
import { useUpdater } from '@/lib/updater-context'
import { CHANGELOG, changelogFor, shouldShowChangelog } from '@/lib/changelog'

/**
 * NOVIDADES DA VERSÃO.
 *
 * O launcher se atualiza sozinho (`services/updater.ts` reinicia até com a
 * janela escondida na bandeja), então até agora a galera mudava de versão sem
 * ficar sabendo de nada. Esta camada é o "olha o que mudou" — e o `<title>`
 * dela é a versão do app, não do modpack: o `ChangelogModal` ao lado faz a
 * mesma coisa pro modpack do Minecraft, e as duas coisas mudam por caminhos
 * diferentes.
 *
 * ## O carimbo silencioso
 *
 * Quem instala do zero **não** vê nada: `lastSeenVersion` nulo carimba a
 * versão atual e cala a boca (ver `shouldShowChangelog`). Aparecer com "olha o
 * que mudou na 1.0.0" como primeira tela de quem nunca usou o app é conversa
 * sobre um passado que a pessoa não viveu.
 *
 * ## Sem Radix, de novo
 *
 * Camada própria com clique-fora e Esc, igual QuickSwitcher e ShortcutsHelp:
 * um Dialog do Radix arrancado da árvore aberto deixa `pointer-events: none`
 * grudado no `<body>` e o app inteiro para de aceitar clique — inclusive os
 * botões de fechar a janela, que aqui são React. Ver lib/interaction-guard.ts.
 */
export function WhatsNewModal() {
  const { settings, update } = useSettings()
  const { whatsNewOpen, openWhatsNew, closeWhatsNew } = useOverlays()
  const { status } = useUpdater()

  const current = status.currentVersion ?? null
  /** Aberto à mão mostra a versão atual; se ela não tem entrada, a mais nova. */
  const entry = changelogFor(current) ?? CHANGELOG[0] ?? null

  // Decide uma vez por versão: mostrar, ou carimbar em silêncio.
  const decided = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!current || !settings) return
    if (decided.current === current) return
    decided.current = current

    if (shouldShowChangelog(current, settings.lastSeenVersion)) {
      openWhatsNew()
      return
    }
    // Instalação nova, ou versão sem novidade escrita: só marca como vista pra
    // a PRÓXIMA atualização ter de onde comparar.
    if (settings.lastSeenVersion !== current) void update({ lastSeenVersion: current })
  }, [current, settings, openWhatsNew, update])

  const close = React.useCallback(() => {
    closeWhatsNew()
    // Carimba ao FECHAR, não ao abrir: se o app morrer com a camada aberta, a
    // pessoa vê de novo — melhor repetir do que engolir a novidade.
    if (current && settings?.lastSeenVersion !== current) {
      void update({ lastSeenVersion: current })
    }
  }, [closeWhatsNew, current, settings, update])

  React.useEffect(() => {
    if (!whatsNewOpen) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [whatsNewOpen, close])

  if (!whatsNewOpen || !entry) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={close}
    >
      <div
        className="card-acid scanlines relative w-full max-w-lg rounded-brutal p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Fechar"
          onClick={close}
          className="absolute right-3 top-3 text-muted-foreground hover:text-acid"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-4 flex items-center gap-3">
          <Sparkles className="h-7 w-7 text-acid drop-shadow-[0_0_8px_rgba(106,255,0,0.6)]" />
          <div className="min-w-0">
            <h2 className="title-brutal text-2xl">{entry.headline}</h2>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Launcher v{entry.version}
            </p>
          </div>
        </div>

        <ul className="max-h-72 space-y-2 overflow-y-auto rounded-brutal border border-acid-dark bg-void p-4">
          {entry.items.map((item, index) => (
            <li key={index} className="flex gap-2 font-mono text-[12px] leading-relaxed">
              <span className="shrink-0 text-acid">›</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        {entry.note && (
          <p className="mt-3 flex gap-2 rounded-brutal border border-burn/40 bg-burn/10 p-3 font-mono text-[11px] leading-relaxed text-burn">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{entry.note}</span>
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <Button onClick={close} className="btn-acid">
            Fechar
          </Button>
        </div>
      </div>
    </div>
  )
}
