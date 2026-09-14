import { Flame, Skull } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DASH,
  fmtDuration,
  fmtKda,
  fmtNumber,
  fmtPercent,
  fmtPlaytime,
  type LolStats
} from '@/lib/api-lol'
import { MatchLine } from './LolMatches'
import { BarRow, Columns, Empty, PlayerChip, SectionTitle, StackedColumns, Tile } from './parts'

/**
 * VISÃO GERAL — a resposta curta pro recorte que está filtrado.
 *
 * A ordem é a ordem das perguntas: quanto se jogou, quanto se ganhou, como se
 * jogou, quando se jogou, quem está em sequência e quais foram as partidas que
 * valem contar. Nada de gráfico decorativo no meio.
 */

function pctOf(part: number, total: number): string {
  if (total <= 0) return DASH
  return `${Math.round((part / total) * 100)}% do tempo`
}

export function LolOverview({ stats }: { stats: LolStats }) {
  const { totals, averages } = stats

  if (totals.games === 0) {
    return <Empty>Nenhuma partida nesse recorte. Troque o período ou tire algum filtro.</Empty>
  }

  const perGame = totals.perGame

  // 24 rótulos de hora não cabem lado a lado: um a cada três já marca o ritmo.
  const hourEmphasis = (key: string): boolean => Number(key) % 3 === 0

  const timeline = stats.timeline.slice(-60)
  const timelineEmphasis = (_key: string, index: number): boolean =>
    timeline.length <= 12 || index % Math.ceil(timeline.length / 8) === 0

  const winrateRows = [...stats.dayparts].filter((row) => row.decided > 0)
  const maxDecided = winrateRows.reduce((acc, row) => Math.max(acc, row.decided), 0)

  return (
    <div className="space-y-5">
      <section>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <Tile
            label="Partidas"
            value={fmtNumber(totals.games)}
            hint={`${totals.wins}V · ${totals.losses}D${totals.remakes > 0 ? ` · ${totals.remakes} remake` : ''}`}
          />
          <Tile
            label="Vitórias"
            value={fmtPercent(totals.winrate, 1)}
            tone={
              totals.winrate === null ? 'neutral' : totals.winrate >= 0.55 ? 'good' : totals.winrate <= 0.45 ? 'bad' : 'neutral'
            }
            hint={`de ${totals.decided} decididas`}
          />
          <Tile
            label="KDA"
            value={fmtKda(totals.kda)}
            hint={
              perGame
                ? `${perGame.kills.toFixed(1)} / ${perGame.deaths.toFixed(1)} / ${perGame.assists.toFixed(1)} por partida`
                : undefined
            }
          />
          <Tile
            label="Duração média"
            value={fmtDuration(averages.durationSec?.value)}
            hint={`vitória ${fmtDuration(averages.winDurationSec?.value)} · derrota ${fmtDuration(averages.lossDurationSec?.value)}`}
          />
          <Tile
            label="Participação"
            value={fmtPercent(averages.killParticipation?.value)}
            hint={`abates do time · ${averages.killParticipation?.sample ?? 0} partidas`}
          />
          <Tile
            label="Fatia do dano"
            value={fmtPercent(averages.damageShare?.value)}
            hint={`do dano do time · ${averages.damageShare?.sample ?? 0} partidas`}
          />
          <Tile label="CS/min" value={fmtNumber(averages.csPerMin?.value, 1)} hint={`${averages.csPerMin?.sample ?? 0} partidas`} />
          <Tile
            label="Dano/min"
            value={fmtNumber(averages.damagePerMin?.value, 0)}
            hint={`a campeões · ${averages.damagePerMin?.sample ?? 0} partidas`}
          />
          <Tile label="Visão/min" value={fmtNumber(averages.visionPerMin?.value, 2)} hint="pontuação de visão" />
          <Tile
            label="Tempo morto"
            value={fmtPlaytime(totals.deadSec)}
            tone="bad"
            hint={pctOf(totals.deadSec, totals.playtimeSec)}
          />
          <Tile label="Tempo em partida" value={fmtPlaytime(totals.playtimeSec)} hint={`${totals.champions} campeões`} />
          <Tile
            label="Pentakills"
            value={fmtNumber(totals.pentaKills)}
            tone={totals.pentaKills > 0 ? 'accent' : 'neutral'}
            hint={`${totals.quadraKills} quadras · ${totals.perfectGames} sem morrer`}
          />
        </div>

        {totals.truncated && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            O período tem mais partidas do que o painel carrega de uma vez — estas são as mais recentes.
          </p>
        )}
      </section>

      <section>
        <SectionTitle title="Ritmo" hint="partidas por dia, divididas entre ganhas e perdidas" />
        {timeline.length === 0 ? (
          <Empty>Sem partidas no período.</Empty>
        ) : (
          <StackedColumns
            data={timeline.map((day) => ({
              key: day.day,
              label: day.day.slice(8) + '/' + day.day.slice(5, 7),
              wins: day.wins,
              losses: day.losses,
              other: day.games - day.wins - day.losses
            }))}
            emphasis={timelineEmphasis}
          />
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <SectionTitle title="A que horas se joga" hint="hora local do fim da partida" />
          <Columns
            data={stats.hours.map((row) => ({
              key: row.key,
              label: row.label.replace('h', ''),
              value: row.games,
              sub: `${fmtPercent(row.winrate)} de vitória`
            }))}
            emphasis={hourEmphasis}
          />
        </section>

        <section>
          <SectionTitle title="A que horas se ganha" hint="winrate por faixa do dia, com a amostra ao lado" />
          {winrateRows.length === 0 ? (
            <Empty>Ainda não há partida decidida suficiente pra separar por horário.</Empty>
          ) : (
            <div className="space-y-0.5">
              {winrateRows.map((row) => (
                <BarRow
                  key={row.key}
                  label={row.label}
                  value={row.winrate}
                  max={1}
                  display={fmtPercent(row.winrate)}
                  sub={`${row.decided}p`}
                  tone={row.winrate !== null && row.winrate >= 0.5 ? 'good' : 'bad'}
                  title={`${row.wins} vitórias em ${row.decided} partidas decididas · barra vazia = 0%, cheia = 100%`}
                />
              ))}
              <p className="pt-1 text-[11px] text-muted-foreground">
                A barra vai de 0% a 100%; o número depois do "p" é de quantas partidas decididas veio.
                {maxDecided < 10 && ' Com essa amostra, trate como curiosidade.'}
              </p>
            </div>
          )}
        </section>
      </div>

      <section>
        <SectionTitle title="Sequências" hint="seguidas agora, e o recorde de cada um no período" />
        {stats.streaks.length === 0 ? (
          <Empty>Sem partida decidida no período.</Empty>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {stats.streaks.map((row) => (
              <div
                key={row.userId}
                className="flex items-center gap-2 rounded-brutal border border-line bg-void/40 px-2 py-1.5"
              >
                <PlayerChip player={row.user} fallback={row.userId} size="md" />
                <span
                  className={cn(
                    'ml-auto flex shrink-0 items-center gap-1 font-mono text-[11.5px]',
                    row.current > 0 ? 'text-acid-text' : row.current < 0 ? 'text-destructive' : 'text-muted-foreground'
                  )}
                  title={
                    row.current > 0
                      ? `${row.current} vitórias seguidas`
                      : row.current < 0
                        ? `${Math.abs(row.current)} derrotas seguidas`
                        : 'sem sequência'
                  }
                >
                  {row.current > 0 ? <Flame className="h-3 w-3" /> : row.current < 0 ? <Skull className="h-3 w-3" /> : null}
                  {row.current > 0 ? `${row.current}V` : row.current < 0 ? `${Math.abs(row.current)}D` : DASH}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground" title="Melhor sequência de vitórias e pior de derrotas no período">
                  rec. {row.bestWin}V / {row.worstLoss}D
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <SectionTitle title="Melhores atuações" hint="nota alta é destaque contra as partidas do próprio filtro" />
          <div className="space-y-1">
            {stats.best.slice(0, 5).map((match, index) => (
              <MatchLine key={match.id} match={match} rank={index + 1} />
            ))}
            {stats.best.length === 0 && <Empty>Sem partidas com estatística completa ainda.</Empty>}
          </div>
        </section>

        <section>
          <SectionTitle title="Piores atuações" hint="as que ninguém quer no recap" />
          <div className="space-y-1">
            {stats.worst.slice(0, 5).map((match, index) => (
              <MatchLine key={match.id} match={match} rank={index + 1} />
            ))}
            {stats.worst.length === 0 && <Empty>Sem partidas com estatística completa ainda.</Empty>}
          </div>
        </section>
      </div>
    </div>
  )
}
