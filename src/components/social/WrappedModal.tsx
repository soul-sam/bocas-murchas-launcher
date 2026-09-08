import * as React from 'react'
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import { formatCompact } from '@/lib/api-gamification'
import {
  formatDayKey,
  formatMinutes,
  hourLabel,
  retro,
  type GroupWrapped,
  type UserWrapped
} from '@/lib/api-retro'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import { useOverlays } from '@/lib/overlay-context'
import { ClipPlayer } from './ClipPlayer'
import { cn } from '@/lib/utils'

/**
 * RETROSPECTIVA MURCHA — o ano do grupo em slides.
 *
 * ## Por que slides e não uma página
 *
 * Uma página com trinta números é um relatório: os olhos batem no maior e
 * pulam o resto. Um número por tela obriga cada um a ter o seu momento — que
 * é o único jeito de "você passou 143 horas em call" causar alguma coisa.
 *
 * ## Por que um slide some quando não tem dado
 *
 * Porque "0 clipes" e "nenhuma aposta" não são retrospectiva, são ausência. O
 * ano de quem entrou em novembro tem seis slides e todos verdadeiros; enchê-lo
 * de zeros pra igualar ao de quem estava desde janeiro só faria a pessoa
 * fechar.
 *
 * ## Por que os slides do GRUPO vêm no fim
 *
 * Porque o gancho é pessoal ("o SEU ano") e o fecho é coletivo ("e o nosso").
 * Invertido, a pessoa sai da tela achando que viu um painel de estatística.
 *
 * Camada própria (não Radix Dialog) — ver lib/interaction-guard.ts.
 */

interface Slide {
  id: string
  render: () => React.ReactNode
}

export function WrappedModal() {
  const { wrappedOpen, wrappedYear, closeWrapped } = useOverlays()
  const { token } = useAuth()

  const [mine, setMine] = React.useState<UserWrapped | null>(null)
  const [group, setGroup] = React.useState<GroupWrapped | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [index, setIndex] = React.useState(0)

  React.useEffect(() => {
    if (!wrappedOpen || !token) return

    let alive = true
    setLoading(true)
    setError(null)
    setIndex(0)

    /**
     * As duas de uma vez, e em paralelo.
     *
     * A primeira chamada de cada ano faz o servidor varrer o ano inteiro (ver
     * lib/wrapped.ts). Em paralelo isso acontece UMA vez: a segunda chamada
     * espera o mesmo trabalho em vez de disparar outro.
     */
    void Promise.all([
      retro.wrapped(token, wrappedYear),
      retro.wrapped(token, wrappedYear, 'grupo')
    ])
      .then(([personal, collective]) => {
        if (!alive) return
        setMine(personal?.kind === 'user' ? personal : null)
        setGroup(collective?.kind === 'grupo' ? collective : null)
      })
      .catch((err: unknown) => {
        if (!alive) return
        setError(err instanceof Error ? err.message : 'Não deu pra montar a retrospectiva')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [wrappedOpen, wrappedYear, token])

  const slides = useSlides(mine, group, wrappedYear)

  const go = React.useCallback(
    (delta: number) => setIndex((prev) => Math.max(0, Math.min(slides.length - 1, prev + delta))),
    [slides.length]
  )

  React.useEffect(() => {
    if (!wrappedOpen) return
    const handle = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeWrapped()
        return
      }
      if (event.key === 'ArrowRight' || event.key === ' ') {
        event.preventDefault()
        go(1)
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        go(-1)
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [wrappedOpen, closeWrapped, go])

  if (!wrappedOpen) return null

  const current = slides[Math.min(index, Math.max(0, slides.length - 1))]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6">
      <div className="card-acid relative flex h-[min(90vh,700px)] w-full max-w-lg flex-col rounded-brutal p-6">
        <button
          type="button"
          aria-label="Fechar"
          onClick={closeWrapped}
          className="absolute right-3 top-3 z-10 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Barra de progresso, uma faixa por slide — igual story. */}
        {slides.length > 1 && (
          <div className="mb-4 flex shrink-0 gap-1">
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                aria-label={`Slide ${i + 1}`}
                onClick={() => setIndex(i)}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors',
                  i <= index ? 'bg-acid' : 'bg-line-strong'
                )}
              />
            ))}
          </div>
        )}

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
          {loading && (
            <div className="text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-acid" />
              <p className="mt-3 text-sm text-muted-foreground">
                Somando o ano inteiro…
                <br />
                <span className="text-[11.5px]">isso leva uns segundos na primeira vez</span>
              </p>
            </div>
          )}

          {!loading && error && (
            <p className="rounded-brutal border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          )}

          {!loading && !error && slides.length === 0 && (
            <p className="text-center text-sm leading-relaxed text-muted-foreground">
              Ainda não tem ano o bastante pra contar história.
              <br />
              Volta em dezembro.
            </p>
          )}

          {!loading && !error && current && (
            <div className="w-full py-2">{current.render()}</div>
          )}
        </div>

        {slides.length > 1 && !loading && (
          <div className="mt-4 flex shrink-0 items-center justify-between">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={index === 0}
              aria-label="Anterior"
              className="rounded-brutal p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="font-mono text-[11.5px] text-muted-foreground">
              {index + 1} / {slides.length}
            </span>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={index >= slides.length - 1}
              aria-label="Próximo"
              className="rounded-brutal p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Os slides
// ---------------------------------------------------------------------------

function useSlides(
  mine: UserWrapped | null,
  group: GroupWrapped | null,
  year: number
): Slide[] {
  const { byId } = useMembers()

  return React.useMemo(() => {
    const slides: Slide[] = []
    if (!mine) return slides

    const me = byId[mine.user.id] ?? mine.user

    slides.push({
      id: 'abertura',
      render: () => (
        <div className="text-center">
          <UserAvatar
            src={resolveAssetUrl(me.avatar)}
            name={me.displayName}
            className="mx-auto h-20 w-20"
          />
          <p className="mt-4 text-sm text-muted-foreground">Seu ano murcho</p>
          <p className="title-brutal text-6xl text-acid">{year}</p>
          <p className="mt-3 text-sm text-foreground">{me.displayName}</p>
          <p className="mt-6 text-xs text-muted-foreground">
            seta pra direita, ou espaço, pra continuar
          </p>
        </div>
      )
    })

    if (mine.voiceMinutes > 0) {
      slides.push({
        id: 'call',
        render: () => (
          <Big
            eyebrow="Você passou"
            value={formatMinutes(mine.voiceMinutes)}
            unit="na call"
            note={
              mine.activeDays > 0
                ? `espalhados por ${mine.activeDays} ${mine.activeDays === 1 ? 'dia' : 'dias'} diferentes`
                : undefined
            }
          />
        )
      })
    }

    if (mine.messages > 0) {
      const quando = hourLabel(mine.peakHour)
      slides.push({
        id: 'mensagens',
        render: () => (
          <Big
            eyebrow="Você mandou"
            value={formatCompact(mine.messages)}
            unit={mine.messages === 1 ? 'mensagem' : 'mensagens'}
            note={
              quando
                ? `a maioria ${quando}${mine.nightMessages > 50 ? ` — e ${formatCompact(mine.nightMessages)} delas de madrugada` : ''}`
                : undefined
            }
          />
        )
      })
    }

    if (mine.topDuo && mine.topDuo.minutes >= 30) {
      const duo = byId[mine.topDuo.id] ?? mine.topDuo
      slides.push({
        id: 'duo',
        render: () => (
          <div className="text-center">
            <p className="text-sm text-muted-foreground">A pessoa que mais te aguentou</p>
            <div className="my-5 flex items-center justify-center gap-3">
              <UserAvatar
                src={resolveAssetUrl(me.avatar)}
                name={me.displayName}
                className="h-14 w-14"
              />
              <span className="text-2xl text-muted-foreground">+</span>
              <UserAvatar
                src={resolveAssetUrl(duo.avatar)}
                name={duo.displayName}
                className="h-14 w-14"
              />
            </div>
            <p className="title-brutal text-3xl text-acid">{duo.displayName}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatMinutes(mine.topDuo!.minutes)} na mesma call
            </p>
          </div>
        )
      })
    }

    if (mine.games > 0) {
      const taxa = mine.games > 0 ? Math.round((mine.wins / mine.games) * 100) : 0
      slides.push({
        id: 'jogo',
        render: () => (
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Você jogou</p>
            <p className="title-brutal text-6xl text-acid">{formatCompact(mine.games)}</p>
            <p className="text-sm text-foreground">
              {mine.games === 1 ? 'partida' : 'partidas'} · {taxa}% de vitória
            </p>
            {mine.favoriteChampion && (
              <p className="mt-4 text-sm text-muted-foreground">
                Sempre de{' '}
                <span className="text-foreground">{mine.favoriteChampion.name}</span> (
                {mine.favoriteChampion.games}×)
              </p>
            )}
            {mine.bestGame && (
              <div className="mt-5 rounded-brutal border border-line bg-void/60 px-4 py-3">
                <p className="text-[11.5px] text-muted-foreground">sua melhor partida</p>
                <p className="font-mono text-xl text-burn">
                  {mine.bestGame.kills}/{mine.bestGame.deaths}/{mine.bestGame.assists}
                </p>
                <p className="text-[11.5px] text-muted-foreground">
                  {mine.bestGame.champion ?? 'sem campeão registrado'}
                  {mine.bestGame.result === 'win' ? ' · e ainda ganhou' : ''}
                </p>
              </div>
            )}
          </div>
        )
      })
    }

    if (mine.soundPlays > 0) {
      slides.push({
        id: 'sons',
        render: () => (
          <Big
            eyebrow="Você tocou"
            value={formatCompact(mine.soundPlays)}
            unit={mine.soundPlays === 1 ? 'som' : 'sons'}
            note={
              mine.favoriteSound
                ? `${mine.favoriteSound.emoji} "${mine.favoriteSound.name}" ${mine.favoriteSound.plays}× — a galera agradece`
                : undefined
            }
          />
        )
      })
    }

    if (mine.coinsEarned > 0 || mine.coinsSpent > 0) {
      slides.push({
        id: 'murchos',
        render: () => (
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Passaram pelas suas mãos</p>
            <p className="title-brutal text-5xl text-acid">{formatCompact(mine.coinsEarned)}</p>
            <p className="text-sm text-foreground">murchos ganhos</p>
            <div className="mt-5 grid grid-cols-2 gap-2 text-left">
              <Tile label="gastos" value={formatCompact(mine.coinsSpent)} />
              {mine.biggestWagerWin > 0 && (
                <Tile label="maior tacada" value={`+${formatCompact(mine.biggestWagerWin)}`} good />
              )}
              {mine.biggestWagerLoss > 0 && (
                <Tile label="maior prejuízo" value={`-${formatCompact(mine.biggestWagerLoss)}`} bad />
              )}
              {mine.tipsGiven > 0 && (
                <Tile label="gorjeta dada" value={formatCompact(mine.tipsGiven)} />
              )}
              {mine.tipsReceived > 0 && (
                <Tile label="gorjeta recebida" value={formatCompact(mine.tipsReceived)} good />
              )}
            </div>
          </div>
        )
      })
    }

    if (mine.topClip) {
      const clip = mine.topClip
      const url = resolveAssetUrl(clip.url)
      slides.push({
        id: 'clipe',
        render: () => (
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              {clip.authorId === mine.user.id ? 'Seu clipe do ano' : 'O clipe do ano em que você entrou'}
            </p>
            <p className="mt-3 break-words font-display text-2xl leading-tight text-foreground">
              {clip.title}
            </p>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              por {clip.displayName} · {clip.reactions}{' '}
              {clip.reactions === 1 ? 'reação' : 'reações'}
            </p>
            {url && (
              <div className="mt-4 rounded-brutal border border-line bg-void/60 px-3 py-2.5 text-left">
                <ClipPlayer src={url} durationMs={clip.durationMs} />
              </div>
            )}
            <p className="mt-4 text-[11.5px] text-muted-foreground">
              {mine.clips > 0 && `você salvou ${mine.clips} ${mine.clips === 1 ? 'clipe' : 'clipes'}`}
              {mine.clips > 0 && mine.clipsIn > mine.clips ? ' · ' : ''}
              {mine.clipsIn > mine.clips && `apareceu em ${mine.clipsIn}`}
            </p>
          </div>
        )
      })
    }

    if (mine.topMessage) {
      const top = mine.topMessage
      slides.push({
        id: 'mensagem',
        render: () => (
          <div className="text-center">
            <p className="text-sm text-muted-foreground">O que você disse de melhor</p>
            <blockquote className="mt-4 rounded-brutal border-2 border-acid-dark bg-void/60 px-4 py-4">
              <p className="whitespace-pre-wrap break-words text-left text-base leading-relaxed text-foreground">
                {top.content || '(uma imagem)'}
              </p>
            </blockquote>
            <p className="mt-2 text-[11.5px] text-muted-foreground">
              {top.reactions} {top.reactions === 1 ? 'reação' : 'reações'}
              {top.channelName ? ` · #${top.channelName}` : ''} ·{' '}
              {new Date(top.at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}
            </p>
          </div>
        )
      })
    }

    if (mine.busiestDay) {
      const day = mine.busiestDay
      slides.push({
        id: 'dia',
        render: () => (
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Seu dia mais murcho</p>
            <p className="title-brutal mt-2 text-4xl text-burn">{formatDayKey(day.dayKey)}</p>
            <p className="mt-3 text-sm text-foreground">
              {day.messages > 0 && `${formatCompact(day.messages)} mensagens`}
              {day.messages > 0 && day.voiceMinutes > 0 && ' e '}
              {day.voiceMinutes > 0 && `${formatMinutes(day.voiceMinutes)} de call`}
            </p>
            <p className="mt-1 text-[11.5px] text-muted-foreground">num dia só</p>
          </div>
        )
      })
    }

    slides.push({
      id: 'placar',
      render: () => (
        <div className="text-center">
          <p className="text-sm text-muted-foreground">No fim das contas</p>
          <p className="title-brutal mt-1 text-5xl text-acid">nível {mine.level}</p>
          <div className="mt-5 grid grid-cols-2 gap-2 text-left">
            <Tile label="xp no ano" value={formatCompact(mine.xp)} />
            {mine.rank > 0 && <Tile label="no ranking" value={`${mine.rank}º de ${mine.of}`} />}
            {mine.bestStreak > 0 && (
              <Tile
                label="maior streak"
                value={`${mine.bestStreak} ${mine.bestStreak === 1 ? 'dia' : 'dias'}`}
              />
            )}
            {mine.badgesEarned > 0 && (
              <Tile label="badges no ano" value={`${mine.badgesEarned}`} />
            )}
          </div>
        </div>
      )
    })

    // --- e agora o grupo -----------------------------------------------
    if (group) {
      slides.push({
        id: 'grupo',
        render: () => (
          <div className="text-center">
            <p className="text-sm text-muted-foreground">E juntos, em {year}</p>
            <p className="title-brutal mt-1 text-5xl text-burn">
              {formatMinutes(group.voiceMinutes)}
            </p>
            <p className="text-sm text-foreground">de call</p>
            <div className="mt-5 grid grid-cols-2 gap-2 text-left">
              <Tile label="mensagens" value={formatCompact(group.messages)} />
              <Tile label="partidas" value={formatCompact(group.games)} />
              <Tile label="sons" value={formatCompact(group.soundPlays)} />
              {group.clips > 0 && <Tile label="clipes" value={`${group.clips}`} />}
            </div>
            {group.topPair && (
              <p className="mt-4 text-[11.5px] text-muted-foreground">
                a dupla do ano:{' '}
                <span className="text-foreground">
                  {group.topPair.a.displayName} e {group.topPair.b.displayName}
                </span>
                , {formatMinutes(group.topPair.minutes)} juntos
              </p>
            )}
          </div>
        )
      })

      if (group.members.length > 1) {
        slides.push({
          id: 'podio',
          render: () => (
            <div>
              <p className="text-center text-sm text-muted-foreground">O pódio do ano</p>
              <ul className="mt-4 space-y-1.5">
                {group.members.slice(0, 8).map((member, i) => {
                  const known = byId[member.id] ?? member
                  return (
                    <li
                      key={member.id}
                      className={cn(
                        'flex items-center gap-2 rounded-brutal border px-2.5 py-1.5',
                        member.id === mine.user.id
                          ? 'border-acid/60 bg-acid/10'
                          : 'border-line bg-void/60'
                      )}
                    >
                      <span className="w-5 shrink-0 text-center font-mono text-sm text-muted-foreground">
                        {i + 1}
                      </span>
                      <UserAvatar
                        src={resolveAssetUrl(known.avatar)}
                        name={known.displayName}
                        className="h-6 w-6 shrink-0"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {known.displayName}
                      </span>
                      <span className="shrink-0 font-mono text-[11.5px] text-acid">
                        {formatCompact(member.xp)} XP
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })
      }
    }

    return slides
  }, [mine, group, year, byId])
}

function Big({
  eyebrow,
  value,
  unit,
  note
}: {
  eyebrow: string
  value: string
  unit: string
  note?: string
}) {
  return (
    <div className="text-center">
      <p className="text-sm text-muted-foreground">{eyebrow}</p>
      <p className="title-brutal text-6xl leading-none text-acid">{value}</p>
      <p className="mt-1 text-sm text-foreground">{unit}</p>
      {note && <p className="mt-4 text-[11.5px] leading-relaxed text-muted-foreground">{note}</p>}
    </div>
  )
}

function Tile({
  label,
  value,
  good,
  bad
}: {
  label: string
  value: string
  good?: boolean
  bad?: boolean
}) {
  return (
    <div className="rounded-brutal border border-line bg-void/60 px-2.5 py-2">
      <p
        className={cn(
          'truncate font-mono text-lg',
          good ? 'text-acid' : bad ? 'text-destructive' : 'text-foreground'
        )}
      >
        {value}
      </p>
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}
