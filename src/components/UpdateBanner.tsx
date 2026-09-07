import { RefreshCw, Sparkles, Loader2, Clock } from 'lucide-react'
import { useUpdater } from '@/lib/updater-context'
import { useNow } from '@/lib/use-now'
import { Button } from '@/components/ui/button'

/**
 * Versao grande do aviso de atualizacao, na tela do Minecraft.
 *
 * O aviso pequeno do cabecalho (UpdatePill) cobre o app inteiro; este aqui
 * existe porque a tela do jogo e onde a pessoa para pra ler antes de jogar — e
 * reiniciar o launcher desatualizado antes de entrar no servidor evita metade
 * dos "nao consigo conectar".
 */
export function UpdateBanner() {
  const { status, applyUpdate, postpone } = useUpdater()
  const now = useNow(status.installAt ? 1_000 : 60_000)

  if (
    status.stage === 'idle' ||
    status.stage === 'checking' ||
    status.stage === 'not-available' ||
    status.stage === 'error'
  ) {
    return null
  }

  // 'available' e 'downloading' viram o mesmo aviso: o download ja comecou
  // sozinho, e ninguem precisa saber que existem dois estagios.
  if (status.stage === 'available' || status.stage === 'downloading') {
    const percent = Math.round(status.percent ?? 0)
    return (
      <div className="mb-4 rounded-brutal border-2 border-burn bg-burn/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <Loader2 className="h-4 w-4 animate-spin text-burn" />
          <div className="flex-1">
            <p className="font-display text-sm uppercase tracking-wider text-burn">
              Baixando v{status.newVersion}
            </p>
            <p className="text-[11.5px] text-muted-foreground">
              {percent}% — pode continuar usando o launcher
            </p>
          </div>
          <div className="h-1.5 w-32 overflow-hidden rounded-full border border-burn/50 bg-void">
            <div
              className="h-full bg-burn transition-all duration-150"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>
    )
  }

  // status.stage === 'downloaded'
  const seconds = status.installAt
    ? Math.max(0, Math.ceil((status.installAt - now.getTime()) / 1000))
    : null

  return (
    <div className="mb-4 rounded-brutal border-2 border-acid bg-acid/10 px-4 py-3 shadow-glow-acid">
      <div className="flex items-center gap-3">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        <div className="flex-1">
          <p className="font-display text-sm uppercase tracking-wider text-acid-text">
            Atualização v{status.newVersion} pronta
          </p>
          <p className="text-[11.5px] text-muted-foreground">
            {seconds !== null
              ? `Reiniciando sozinho em ${seconds}s`
              : status.postponedUntil
                ? 'Adiada — reinicia sozinho mais tarde, ou agora se preferir'
                : 'Reinicia sozinho quando você sair da call ou do jogo'}
          </p>
        </div>
        {seconds !== null && (
          <Button size="sm" variant="outline" onClick={() => void postpone()}>
            <Clock className="mr-2 h-3 w-3" />
            Adiar 30 min
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => void applyUpdate()}>
          <RefreshCw className="mr-2 h-3 w-3" />
          Reiniciar agora
        </Button>
      </div>
    </div>
  )
}
