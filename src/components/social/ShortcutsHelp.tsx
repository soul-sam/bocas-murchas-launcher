import { X } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { useOverlays } from '@/lib/overlay-context'
import { formatAccelerator } from './HotkeyRecorder'

/**
 * Lista de atalhos (Ctrl+/).
 *
 * Metade das funcionalidades boas do app são invisíveis: seta pra cima edita,
 * Ctrl+K troca de canal, Esc cancela a resposta. Sem uma lista, só descobre
 * quem já usou Discord — e o resto do grupo nunca ia saber que existem.
 *
 * Os atalhos globais são lidos das configurações de verdade, não escritos à
 * mão aqui: quem trocou o mute pra outra tecla precisa ver a tecla DELE.
 */

interface Row {
  keys: string
  what: string
}

function Group({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="mb-4">
      <h3 className="mb-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.what} className="flex items-baseline gap-3">
            <kbd className="shrink-0 rounded-brutal border border-line-strong bg-void px-1.5 py-0.5 font-mono text-[11.5px] text-acid">
              {row.keys}
            </kbd>
            <span className="text-xs text-muted-foreground">{row.what}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export function ShortcutsHelp() {
  const { shortcutsOpen, closeShortcuts } = useOverlays()
  const { settings } = useSettings()

  if (!shortcutsOpen) return null

  const hotkeys = settings.hotkeys

  const globalRows: Row[] = [
    { keys: formatAccelerator(hotkeys.mute) || '—', what: 'Silenciar o microfone' },
    { keys: formatAccelerator(hotkeys.deafen) || '—', what: 'Ensurdecer' },
    ...(hotkeys.pttToggle
      ? [{ keys: formatAccelerator(hotkeys.pttToggle), what: 'Push-to-talk (fora da janela)' }]
      : []),
    ...(hotkeys.nudgeChannel
      ? [{ keys: formatAccelerator(hotkeys.nudgeChannel), what: 'Cutucar a call' }]
      : [])
  ]

  return (
    <div
      onClick={closeShortcuts}
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="card-gradient relative max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-brutal border-2 border-acid-dark p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)]"
      >
        <button
          type="button"
          onClick={closeShortcuts}
          aria-label="Fechar"
          className="absolute right-3 top-3 rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="title-brutal mb-4 text-xl">Atalhos</h2>

        <div className="grid gap-x-8 sm:grid-cols-2">
          <div>
            <Group
              title="Geral"
              rows={[
                { keys: 'Ctrl + K', what: 'Ir pra um canal / rodar comando' },
                { keys: 'Ctrl + /', what: 'Esta lista' },
                { keys: 'Ctrl + Shift + U', what: 'Destravar a interface' },
                { keys: 'Esc', what: 'Fechar o que estiver aberto' }
              ]}
            />

            <Group
              title="Chat"
              rows={[
                { keys: 'Enter', what: 'Enviar' },
                { keys: 'Shift + Enter', what: 'Quebrar linha' },
                { keys: '↑', what: 'Editar sua última mensagem' },
                { keys: 'Esc', what: 'Cancelar resposta ou edição' },
                { keys: 'Tab', what: 'Completar @menção' }
              ]}
            />
          </div>

          <div>
            <Group title="Atalhos globais" rows={globalRows} />

            <Group
              title="Formatação"
              rows={[
                { keys: '**texto**', what: 'Negrito' },
                { keys: '*texto*', what: 'Itálico' },
                { keys: '__texto__', what: 'Sublinhado' },
                { keys: '~~texto~~', what: 'Riscado' },
                { keys: '||texto||', what: 'Spoiler' },
                { keys: '`código`', what: 'Código' },
                { keys: '> texto', what: 'Citação' },
                { keys: '@nome  #canal', what: 'Citar alguém / linkar canal' }
              ]}
            />
          </div>
        </div>

        <p className="mt-2 border-t border-line pt-3 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
          Os atalhos globais valem com o launcher em segundo plano e podem ser
          trocados em Configurações → Atalhos.
        </p>
      </div>
    </div>
  )
}
