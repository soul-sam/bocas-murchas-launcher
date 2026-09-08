import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { alerts as alertsApi, isSnoozed, type VoiceAlert } from '@/lib/api-alerts'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'

/**
 * "ME AVISA QUANDO ENCHER" — a única preferência do launcher que NÃO mora no
 * settings.json.
 *
 * Ela precisa valer com o launcher fechado, e um arquivo no disco desta
 * máquina não avisa ninguém quando o processo não existe. Então: banco, e o
 * servidor manda push (ver modules/voice-alert.ts). Isso também é o que faz a
 * escolha seguir a pessoa pra outro computador.
 */
export function VoiceAlertSettings() {
  const { token } = useAuth()

  const [alert, setAlert] = React.useState<VoiceAlert | null>(null)
  const [range, setRange] = React.useState({ min: 2, max: 10 })
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!token) return
    let alive = true
    alertsApi
      .get(token)
      .then((res) => {
        if (!alive) return
        setAlert(res.alert)
        setRange({ min: res.min, max: res.max })
      })
      .catch(() => {
        // Servidor antigo (sem /api/alerts): a seção some em vez de mostrar
        // um controle que não faz nada.
        if (alive) setError('indisponível')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [token])

  const patch = async (
    changes: Parameters<typeof alertsApi.update>[1],
    optimistic?: Partial<VoiceAlert>
  ): Promise<void> => {
    if (!token || saving) return
    // Otimista no que dá: o switch não pode esperar a rede pra virar.
    if (optimistic) setAlert((prev) => (prev ? { ...prev, ...optimistic } : prev))
    setSaving(true)
    try {
      setAlert(await alertsApi.update(token, changes))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra salvar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        carregando
      </div>
    )
  }

  if (error === 'indisponível' || !alert) return null

  const snoozed = isSnoozed(alert)
  const options: number[] = []
  for (let n = range.min; n <= range.max; n++) options.push(n)

  return (
    <div>
      <label className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm">Me avisa quando encher</span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
            Quando a call chegar no número de gente que você escolher, o
            launcher te chama — e se ele estiver fechado, o aviso vai pro
            celular. Não dispara se você já estiver numa call, e sai no máximo
            uma vez a cada duas horas.
          </span>
        </span>
        <input
          type="checkbox"
          checked={alert.enabled}
          disabled={saving}
          onChange={(e) => void patch({ enabled: e.target.checked }, { enabled: e.target.checked })}
          className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--acid))]"
        />
      </label>

      {alert.enabled && (
        <div className="mt-3 space-y-2 border-l-2 border-line pl-3">
          <label className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-sm">A partir de</span>
            <select
              value={alert.threshold}
              disabled={saving}
              onChange={(e) => void patch({ threshold: Number(e.target.value) })}
              className="input-terminal h-8 shrink-0 rounded-brutal px-2 text-xs"
            >
              {options.map((n) => (
                <option key={n} value={n}>
                  {n} pessoas
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-[11.5px] text-muted-foreground">
              {snoozed
                ? `Em silêncio até ${new Date(alert.snoozeUntil!).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}`
                : 'Recebendo normalmente'}
            </span>
            <button
              type="button"
              disabled={saving}
              onClick={() => void patch({ snoozeMinutes: snoozed ? null : 8 * 60 })}
              className={cn(
                'shrink-0 rounded-brutal border px-2 py-1 text-[11.5px] transition-colors',
                snoozed
                  ? 'border-acid/60 text-acid hover:bg-acid/10'
                  : 'border-line text-muted-foreground hover:border-burn/50 hover:text-burn'
              )}
            >
              {snoozed ? 'voltar a receber' : 'hoje não'}
            </button>
          </div>
        </div>
      )}

      {error && error !== 'indisponível' && (
        <p className="mt-2 text-[11.5px] text-destructive">{error}</p>
      )}
    </div>
  )
}
