import * as React from 'react'
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from 'lucide-react'
import { parseMetadata } from '@/lib/api'
import {
  gamification as api,
  formatCompact,
  type RecapCardMeta,
  type WeeklyRecap
} from '@/lib/api-gamification'
import { useAuth } from '@/lib/auth-context'
import { useLayout } from '@/lib/layout-context'
import { useMembers } from '@/lib/members-context'
import { useOverlays } from '@/lib/overlay-context'
import { AwardIcon, BadgeIcon } from '@/lib/cosmetic-icons'
import { cn } from '@/lib/utils'
import { ArenaHeader, ArenaTabs } from './ArenaChrome'
import { WagerRanking } from './WagerRanking'

/**
 * RECAP — a semana do grupo, e as anteriores.
 *
 * Era uma caixinha dobrada embaixo de três botões no ranking, mostrando as
 * cinco primeiras premiações do último recap. Com painel próprio cabe a
 * lista inteira, os totais da semana em tiles, as badges que saíram e a seta
 * pra voltar às semanas anteriores (GET /gamification/recaps). A
 * retrospectiva do ano é a mesma pergunta em escala maior — mora aqui
 * embaixo, não num botão perdido no cabeçalho do ranking.
 *
 * Busca uma vez por abertura: o recap muda no domingo, não a cada clique.
 */

export function RecapPanel() {
  const { closeRecap: close } = useLayout()
  const { token } = useAuth()
  const { openWrapped } = useOverlays()
  const currentYear = new Date().getFullYear()

  // undefined = buscando · null = falhou · [] = ainda não houve recap
  const [recaps, setRecaps] = React.useState<WeeklyRecap[] | null | undefined>(undefined)
  const [index, setIndex] = React.useState(0)

  React.useEffect(() => {
    if (!token) return
    let cancelled = false
    void api
      .recaps(token, 12)
      .then((list) => {
        if (!cancelled) setRecaps(list)
      })
      .catch(() => {
        if (!cancelled) setRecaps(null)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const recap = recaps?.[index]

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-void xl:w-80">
      <ArenaHeader title="Recap" onClose={close} />
      <ArenaTabs current="recap" />

      <div className="scroll-stable min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {recaps === undefined ? (
          <p className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> buscando a semana
          </p>
        ) : recaps === null ? (
          <p className="rounded-brutal border border-destructive/40 bg-destructive/10 px-3 py-3 text-center text-xs text-destructive">
            Não deu pra carregar o recap agora.
          </p>
        ) : recaps.length === 0 || !recap ? (
          <div className="rounded-brutal border border-line bg-void/60 px-3 py-6 text-center">
            <p className="text-xs text-foreground">Nenhum recap ainda.</p>
            <p className="mt-1 text-[11px] text-muted-foreground">O primeiro sai no domingo, com a semana fechada.</p>
          </div>
        ) : (
          <>
            {/* Navegação entre semanas: mais nova à direita, como um calendário. */}
            <div className="flex items-center gap-1 rounded-brutal border border-line bg-depth-2 p-0.5">
              <button
                type="button"
                onClick={() => setIndex((i) => Math.min(recaps.length - 1, i + 1))}
                disabled={index >= recaps.length - 1}
                aria-label="Semana anterior"
                className="rounded-[4px] p-1 text-muted-foreground transition-colors hover:bg-void-light hover:text-foreground disabled:opacity-30"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <p className="min-w-0 flex-1 truncate text-center text-xs text-foreground">
                {weekLabel(recap, index)}
              </p>
              <button
                type="button"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
                aria-label="Semana seguinte"
                className="rounded-[4px] p-1 text-muted-foreground transition-colors hover:bg-void-light hover:text-foreground disabled:opacity-30"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <RecapBody recap={recap} />
          </>
        )}

        {/* Apostas: segue a semana na tela; sem recap, a semana corrente. */}
        {recaps !== undefined && <WagerRanking weekStart={recap?.weekStart} />}

        {/* A retrospectiva fica sempre alcançável — inclusive sem recap nenhum,
            porque o ano tem mais que semanas. */}
        <button
          type="button"
          onClick={() => openWrapped()}
          className="flex w-full items-center justify-center gap-2 rounded-brutal border border-acid/60 px-3 py-2 text-xs font-medium text-acid transition-colors hover:bg-acid/10"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Retrospectiva Murcha {currentYear}
        </button>
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------------------

function RecapBody({ recap }: { recap: WeeklyRecap }) {
  const { byId } = useMembers()
  const { openAchievements } = useOverlays()
  const meta = parseMetadata<RecapCardMeta>(recap.payload)

  if (!meta) {
    return <p className="text-xs text-muted-foreground">Recap sem detalhes guardados.</p>
  }

  const awards = meta.awards ?? []
  const totals = meta.totals
  const badges = meta.badgesGranted ?? []

  return (
    <div className="space-y-3">
      <section>
        <h4 className="mb-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
          Premiações
        </h4>
        {awards.length === 0 ? (
          <p className="text-xs text-muted-foreground">Semana sem premiação.</p>
        ) : (
          <ul className="divide-y divide-line rounded-brutal border border-line bg-void/60">
            {awards.map((award) => {
              const person = byId[award.userId]
              return (
                <li key={award.key} className="flex items-center gap-2 px-2 py-1.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-brutal bg-burn/10 text-burn">
                    <AwardIcon awardKey={award.key} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] text-muted-foreground">{award.title}</span>
                    <span
                      className="block truncate text-sm leading-tight"
                      style={person?.profileColor ? { color: person.profileColor } : undefined}
                    >
                      {person?.displayName ?? award.displayName}
                    </span>
                  </span>
                  <span className="shrink-0 text-right font-mono text-[11.5px] text-burn">
                    {formatCompact(award.value)}
                    <span className="block text-[11px] font-normal text-muted-foreground">{award.label}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {totals && (
        <section>
          <h4 className="mb-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
            A semana em números
          </h4>
          <div className="grid grid-cols-2 gap-1.5">
            <Tile label="mensagens" value={formatCompact(totals.messages)} />
            <Tile label="em call" value={formatHours(totals.voiceMinutes)} />
            <Tile
              label="partidas"
              value={String(totals.games)}
              detail={totals.games > 0 ? `${totals.wins} ${totals.wins === 1 ? 'vitória' : 'vitórias'}` : undefined}
            />
            <Tile label="sons tocados" value={formatCompact(totals.soundPlays)} />
            <Tile label="cutucadas" value={formatCompact(totals.nudges)} />
            <Tile label="XP do grupo" value={formatCompact(totals.xp)} accent />
          </div>
        </section>
      )}

      {badges.length > 0 && (
        <section>
          <h4 className="mb-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
            Badges da semana
          </h4>
          <ul className="space-y-0.5">
            {badges.map((b, i) => {
              const person = byId[b.userId]
              return (
                <li key={`${b.badgeId}-${b.userId}-${i}`}>
                  <button
                    type="button"
                    onClick={() => openAchievements(b.badgeId)}
                    title="Ver no painel de conquistas"
                    className="flex w-full items-center gap-2 rounded-brutal px-2 py-1 text-left transition-colors hover:bg-void-light"
                  >
                    <BadgeIcon badgeId={b.badgeId} className="h-4 w-4 shrink-0 text-acid-text" />
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">{b.name}</span>
                    <span
                      className="shrink-0 truncate text-[11px] text-muted-foreground"
                      style={person?.profileColor ? { color: person.profileColor } : undefined}
                    >
                      {person?.displayName ?? '?'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

function Tile({ label, value, detail, accent }: { label: string; value: string; detail?: string; accent?: boolean }) {
  return (
    <div className={cn('rounded-brutal border px-2.5 py-2', accent ? 'border-acid-dark/60 bg-acid/[0.05]' : 'border-line bg-void/60')}>
      <p className={cn('font-mono text-sm leading-tight', accent ? 'text-acid-text' : 'text-foreground')}>{value}</p>
      <p className="text-[11px] text-muted-foreground">
        {label}
        {detail && <span className="text-foreground/80"> · {detail}</span>}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------

function shortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/**
 * Fim da semana: a lista (`/recaps`) vem sem `weekEnd`, só o `/recap/latest`
 * traz. O payload tem; na falta dele, domingo é segunda + 6.
 */
function weekEndOf(recap: WeeklyRecap): string {
  if (recap.weekEnd) return recap.weekEnd
  const meta = parseMetadata<RecapCardMeta>(recap.payload)
  if (meta?.weekEnd) return meta.weekEnd
  const start = new Date(recap.weekStart)
  if (Number.isNaN(start.getTime())) return recap.weekStart
  return new Date(start.getTime() + 6 * 86_400_000).toISOString()
}

function weekLabel(recap: WeeklyRecap, index: number): string {
  const range = `${shortDate(recap.weekStart)} – ${shortDate(weekEndOf(recap))}`
  if (index === 0) return `Última semana · ${range}`
  if (index === 1) return `Semana anterior · ${range}`
  return `Semana ${range}`
}

function formatHours(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 min'
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return hours > 0 ? `${hours}h${String(rest).padStart(2, '0')}` : `${rest} min`
}
