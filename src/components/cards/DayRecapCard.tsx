import { Moon } from 'lucide-react'
import type { CardProps } from './index'
import { CardFrame } from './index'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import { formatCompact } from '@/lib/api-gamification'
import { formatDayKey, formatMinutes, type DayRecap } from '@/lib/api-retro'
import { useMembers } from '@/lib/members-context'
import { NameEmoji } from '@/components/social/NameEmoji'

/**
 * CARTÃO "FECHANDO O DIA" — sai às 23h.
 *
 * Deliberadamente menor que o recap de domingo. Domingo é o evento, com
 * prêmio em murcho e badge; isto aqui é o placar da noite, pra dar um motivo
 * de olhar o launcher antes de dormir. Se os dois tivessem o mesmo peso, o de
 * domingo deixaria de ser especial em uma semana.
 *
 * A fileira de rostos no rodapé é a parte que importa: "quem apareceu hoje" é
 * a única informação aqui que faz alguém pensar "poxa, não vi o Fulano".
 */
export function DayRecapCard({ message, metadata }: CardProps<DayRecap>) {
  const { byId } = useMembers()

  const totals = metadata.totals
  const highlights = Array.isArray(metadata.highlights) ? metadata.highlights : []
  const people = Array.isArray(metadata.people) ? metadata.people : []
  const best = metadata.bestGame

  if (!totals) return <p className="text-sm text-foreground">{message.content}</p>

  const tiles: Array<{ label: string; value: string }> = [
    { label: 'msgs', value: formatCompact(totals.messages ?? 0) },
    { label: 'em call', value: formatMinutes(totals.voiceMinutes ?? 0) },
    { label: 'partidas', value: `${totals.games ?? 0}` },
    { label: 'sons', value: formatCompact(totals.soundPlays ?? 0) }
  ]
  // Clipe e gorjeta só entram no placar quando aconteceram — uma coluna
  // marcando zero todo dia só ensina a galera a não olhar.
  if (totals.clips > 0) tiles.push({ label: 'clipes', value: `${totals.clips}` })
  if (totals.tipTotal > 0)
    tiles.push({ label: 'gorjeta', value: formatCompact(totals.tipTotal) })

  return (
    <CardFrame
      accent="muted"
      icon={<Moon className="h-3.5 w-3.5" />}
      title={
        <span>
          Fechando o dia <span className="text-foreground">{formatDayKey(metadata.dayKey)}</span>
        </span>
      }
      footer={
        people.length > 0 ? (
          <div className="flex items-center gap-1.5 normal-case">
            <span className="shrink-0">apareceram</span>
            <span className="flex min-w-0 flex-wrap items-center gap-1">
              {people.slice(0, 12).map((p) => {
                const known = byId[p.id]
                return (
                  <UserAvatar
                    userId={p.id}
                    key={p.id}
                    src={resolveAssetUrl(known?.avatar ?? p.avatar)}
                    name={known?.displayName ?? p.displayName}
                    ringColor={known?.profileColor}
                    className="h-5 w-5"
                  />
                )
              })}
              {people.length > 12 && (
                <span className="text-muted-foreground">+{people.length - 12}</span>
              )}
            </span>
          </div>
        ) : undefined
      }
    >
      <div className="grid grid-cols-4 gap-1">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-brutal border border-line bg-void/60 px-1 py-1 text-center"
          >
            <p className="truncate font-mono text-xs text-foreground">{tile.value}</p>
            <p className="truncate text-[11px] text-muted-foreground">{tile.label}</p>
          </div>
        ))}
      </div>

      {highlights.length > 0 && (
        <ul className="mt-2 space-y-1">
          {highlights.map((h) => {
            const who = byId[h.userId]
            const name = who?.displayName ?? h.displayName
            const color = who?.profileColor ?? undefined
            return (
              <li key={h.key} className="flex items-center gap-2">
                <span aria-hidden className="w-5 shrink-0 text-center text-sm">
                  {h.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {h.title}
                  </span>
                  <span
                    className="flex items-center gap-1 text-sm leading-tight"
                    style={color ? { color } : undefined}
                  >
                    <span className="truncate">{name}</span>
                    <NameEmoji id={who?.emoji} />
                  </span>
                </span>
                <span className="shrink-0 text-[11.5px] text-muted-foreground">{h.label}</span>
              </li>
            )
          })}
        </ul>
      )}

      {best && (
        <p className="mt-2 text-xs text-muted-foreground">
          <span aria-hidden>⚔ </span>
          Melhor partida:{' '}
          <span className="text-foreground">{byId[best.userId]?.displayName ?? best.displayName}</span>
          {best.champion ? ` de ${best.champion}` : ''}, {best.kills}/{best.deaths}/{best.assists}
          {best.result === 'win' ? ' e ganhou' : ''}
        </p>
      )}
    </CardFrame>
  )
}
