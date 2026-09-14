import { Lightbulb, Medal, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DASH,
  fmtCompact,
  fmtDuration,
  fmtNumber,
  fmtPercent,
  lolQueueLabel,
  type LolGroupRow,
  type LolRecord,
  type LolStats
} from '@/lib/api-lol'
import { MatchLine } from './LolMatches'
import { BarRow, Empty, SectionTitle } from './parts'

/**
 * PADRÕES E RECORDES — o "e daí?" do painel.
 *
 * As frases vêm prontas do servidor, que é quem tem o histórico inteiro e quem
 * sabe se a diferença sustenta a afirmação. O launcher não inventa nenhuma:
 * ele desenha o que passou nas travas de amostra e diferença mínima, e mostra
 * o aviso quando não passou nada — silêncio é resposta, chute não é.
 */

function InsightCard({
  tone,
  title,
  detail,
  sample
}: {
  tone: 'good' | 'bad' | 'neutral'
  title: string
  detail: string
  sample: number
}) {
  const Icon = tone === 'good' ? TrendingUp : tone === 'bad' ? TrendingDown : Lightbulb

  return (
    <div
      className={cn(
        'flex gap-2 rounded-brutal border px-2.5 py-2',
        tone === 'good' && 'border-acid/50 bg-acid/5',
        tone === 'bad' && 'border-destructive/50 bg-destructive/5',
        tone === 'neutral' && 'border-line bg-void/40'
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          tone === 'good' && 'text-acid',
          tone === 'bad' && 'text-destructive',
          tone === 'neutral' && 'text-burn'
        )}
      />
      <div className="min-w-0">
        <p className="text-[11.5px] leading-snug text-foreground">{title}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{detail}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">amostra: {sample} partidas</p>
      </div>
    </div>
  )
}

/** Um recorte de winrate desenhado como barra de 0 a 100%. */
function WinrateBars({
  rows,
  labelOf
}: {
  rows: Array<{ key: string; label: string; winrate: number | null; decided: number; wins: number }>
  labelOf?: (key: string, label: string) => string
}) {
  const usable = rows.filter((row) => row.decided > 0)
  if (usable.length === 0) return <Empty>Sem partida decidida nesse recorte.</Empty>

  return (
    <div className="space-y-0.5">
      {usable.map((row) => (
        <BarRow
          key={row.key}
          label={labelOf ? labelOf(row.key, row.label) : row.label}
          value={row.winrate}
          max={1}
          display={fmtPercent(row.winrate)}
          sub={`${row.decided}p`}
          tone={row.winrate !== null && row.winrate >= 0.5 ? 'good' : 'bad'}
          title={`${row.wins} vitórias em ${row.decided} partidas decididas`}
        />
      ))}
    </div>
  )
}

function RecordCard({ record }: { record: LolRecord }) {
  return (
    <div className="rounded-brutal border border-line bg-void/40 p-2">
      <div className="flex items-baseline gap-2">
        <Medal className="h-3.5 w-3.5 shrink-0 self-center text-burn" />
        <p className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">{record.label}</p>
        <p className="shrink-0 font-display text-base text-foreground">
          {record.format === 'duration' ? fmtDuration(record.value) : fmtCompact(record.value)}
        </p>
      </div>
      <div className="mt-1">
        <MatchLine match={record.match} />
      </div>
    </div>
  )
}

export function LolPatterns({ stats }: { stats: LolStats }) {
  const marathonRows = stats.marathon.map((row) => ({
    key: row.bucket,
    label: row.bucket === '4+' ? 'Da 4ª em diante' : `${row.bucket}ª da sentada`,
    winrate: row.winrate,
    decided: row.games,
    wins: row.wins
  }))

  const asRows = (rows: LolGroupRow[]) =>
    rows.map((row) => ({
      key: row.key,
      label: row.label,
      winrate: row.winrate,
      decided: row.decided,
      wins: row.wins
    }))

  return (
    <div className="space-y-5">
      <section>
        <SectionTitle
          title="O que os números dizem"
          hint="só entra aqui o que se sustenta na amostra — o resto fica de fora de propósito"
        />
        {stats.insights.length === 0 ? (
          <Empty>
            Ainda não dá pra afirmar nada com segurança nesse recorte. Amplie o período ou jogue mais —
            padrão de 5 partidas é ruído com cara de padrão.
          </Empty>
        ) : (
          <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
            {stats.insights.map((insight) => (
              <InsightCard
                key={insight.id}
                tone={insight.tone}
                title={insight.title}
                detail={insight.detail}
                sample={insight.sample}
              />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <SectionTitle title="Por dia da semana" hint="winrate e quantas partidas sustentam cada dia" />
          <WinrateBars rows={asRows(stats.weekdays)} />
        </section>

        <section>
          <SectionTitle title="Por duração da partida" hint="jogo que estica é jogo que vira ou que desanda?" />
          <WinrateBars rows={asRows(stats.durations)} />
        </section>

        <section>
          <SectionTitle
            title="Por partida da sentada"
            hint="sentada = partidas com menos de 1h30 de intervalo entre elas"
          />
          <WinrateBars rows={marathonRows} />
        </section>

        <section>
          <SectionTitle title="Por fila" hint="ranked, normal, ARAM — cada uma com o seu resultado" />
          <WinrateBars rows={asRows(stats.queues)} labelOf={(key) => lolQueueLabel(key)} />
        </section>
      </div>

      <section>
        <SectionTitle title="Recordes" hint="o extremo de cada métrica no recorte, com a partida que o fez" />
        {stats.records.length === 0 ? (
          <Empty>Sem partidas com estatística completa no período.</Empty>
        ) : (
          <div className="grid gap-1.5 lg:grid-cols-2">
            {stats.records.map((record) => (
              <RecordCard key={record.key} record={record} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle title="Contadores" hint="o que é raro, contado" />
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {[
            { label: 'Pentakills', value: stats.totals.pentaKills },
            { label: 'Quadrakills', value: stats.totals.quadraKills },
            { label: 'Triplos', value: stats.totals.tripleKills },
            { label: 'Duplos', value: stats.totals.doubleKills },
            { label: 'Sem morrer', value: stats.totals.perfectGames },
            { label: 'Remakes', value: stats.totals.remakes },
            { label: 'Sem fim detectado', value: stats.totals.unknown },
            { label: 'Abates somados', value: stats.totals.kills }
          ].map((counter) => (
            <div key={counter.label} className="rounded-brutal border border-line bg-void/40 px-2 py-1.5">
              <p className="text-[11px] text-muted-foreground">{counter.label}</p>
              <p className="font-display text-lg leading-tight text-foreground">
                {counter.value > 0 ? fmtNumber(counter.value) : DASH}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
