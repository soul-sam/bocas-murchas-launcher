import * as React from 'react'
import { Check, RotateCcw, Users, X } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  LOL_PERIODS,
  lolQueueLabel,
  type LolFilterOptions,
  type LolPeriod,
  type LolQuery
} from '@/lib/api-lol'

/**
 * A BARRA DE FILTROS DO MURAL.
 *
 * Uma linha só, do jeito que se lê: período, quem, fila, campeão, resultado.
 * Tudo que está marcado aparece marcado — nada de filtro escondido atrás de
 * menu, porque um painel inteiro muda de resposta conforme o recorte e a
 * pessoa precisa ver de que recorte está falando.
 *
 * Campeão é campo de texto com sugestão (e não uma lista de 170 botões): a
 * lista completa não cabe, e quem quer ver um campeão específico sabe o nome.
 */

const RESULTS: Array<{ id: string; label: string }> = [
  { id: 'win', label: 'Vitórias' },
  { id: 'loss', label: 'Derrotas' },
  { id: 'remake', label: 'Remakes' }
]

function Chip({
  children,
  active,
  onClick,
  title
}: {
  children: React.ReactNode
  active?: boolean
  onClick: () => void
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-brutal border px-1.5 py-0.5 text-[11.5px] transition-colors',
        active
          ? 'border-acid bg-acid/10 text-acid-text'
          : 'border-line-strong text-muted-foreground hover:border-acid/50 hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-1">{children}</div>
    </div>
  )
}

export function LolFilters({
  query,
  options,
  queueNames,
  onChange,
  onReset
}: {
  query: LolQuery
  options: LolFilterOptions | null
  /**
   * Nome de fila que veio das partidas do recorte — é o que o cliente do LoL
   * chamou aquela fila. A lista de filtros sozinha só conhece o queueId, então
   * sem isto o mesmo modo aparecia como "Modo do Evento" na tabela e
   * "Fila 4310" no chip logo acima dela.
   */
  queueNames?: Map<string, string>
  onChange: (next: LolQuery) => void
  onReset: () => void
}) {
  const [champInput, setChampInput] = React.useState('')

  const toggle = (key: 'users' | 'champions' | 'queues' | 'results', value: string): void => {
    const current = query[key] ?? []
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    onChange({ ...query, [key]: next })
  }

  const addChampion = (raw: string): void => {
    const name = raw.trim()
    if (!name) return
    // O servidor compara em minúsculas; o nome exato do cliente é o que vale
    // pra mostrar, então guardamos como veio da lista de sugestões.
    const known = options?.champions.find((c) => c.name.toLowerCase() === name.toLowerCase())
    const value = known?.name ?? name
    if ((query.champions ?? []).some((c) => c.toLowerCase() === value.toLowerCase())) return
    onChange({ ...query, champions: [...(query.champions ?? []), value] })
    setChampInput('')
  }

  const dirty =
    query.period !== '90d' ||
    (query.users?.length ?? 0) > 0 ||
    (query.champions?.length ?? 0) > 0 ||
    (query.queues?.length ?? 0) > 0 ||
    (query.results?.length ?? 0) > 0 ||
    query.group === true

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-3 py-2">
      <Group label="Período">
        {LOL_PERIODS.map((period) => (
          <Chip
            key={period.id}
            active={query.period === period.id}
            onClick={() => onChange({ ...query, period: period.id as LolPeriod })}
          >
            {period.label}
          </Chip>
        ))}
      </Group>

      {options && options.players.length > 0 && (
        <Group label="Quem">
          {options.players.map((player) => {
            const active = (query.users ?? []).includes(player.id)
            return (
              <Chip
                key={player.id}
                active={active}
                onClick={() => toggle('users', player.id)}
                title={`${player.games} partidas`}
              >
                <UserAvatar
                  src={resolveAssetUrl(player.avatar)}
                  name={player.displayName}
                  ringColor={player.profileColor ?? undefined}
                  className="h-3.5 w-3.5"
                />
                {player.displayName}
              </Chip>
            )
          })}
        </Group>
      )}

      {options && options.queues.length > 1 && (
        <Group label="Fila">
          {options.queues.map((queue) => (
            <Chip
              key={queue.id}
              active={(query.queues ?? []).includes(queue.id)}
              onClick={() => toggle('queues', queue.id)}
              title={`${queue.games} partidas`}
            >
              {queueNames?.get(queue.id) ?? queue.label ?? lolQueueLabel(queue.id)}
            </Chip>
          ))}
        </Group>
      )}

      <Group label="Resultado">
        {RESULTS.map((result) => (
          <Chip
            key={result.id}
            active={(query.results ?? []).includes(result.id)}
            onClick={() => toggle('results', result.id)}
          >
            {result.label}
          </Chip>
        ))}
      </Group>

      <Group label="Campeão">
        {(query.champions ?? []).map((champion) => (
          <span
            key={champion}
            className="flex shrink-0 items-center gap-1 rounded-brutal border border-acid bg-acid/10 px-1.5 py-0.5 text-[11.5px] text-acid-text"
          >
            {champion}
            <button
              type="button"
              onClick={() => toggle('champions', champion)}
              aria-label={`Tirar ${champion} do filtro`}
              className="transition-colors hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={champInput}
          onChange={(event) => setChampInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addChampion(champInput)
            }
          }}
          list="lol-champions"
          placeholder="digite um nome"
          className="h-6 w-28 rounded-brutal border border-line-strong bg-void px-1.5 text-[11.5px] text-foreground outline-none placeholder:text-muted-foreground focus:border-acid/60"
        />
        <datalist id="lol-champions">
          {(options?.champions ?? []).map((champion) => (
            <option key={champion.name} value={champion.name}>
              {champion.games} partidas
            </option>
          ))}
        </datalist>
      </Group>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Chip
          active={query.group === true}
          onClick={() => onChange({ ...query, group: !query.group })}
          title="Só partidas em que outra pessoa do grupo estava no mesmo time (pelo id da partida ou pelo Riot ID do aliado)."
        >
          {query.group ? <Check className="h-3 w-3" /> : <Users className="h-3 w-3" />}
          Com a galera
        </Chip>

        {dirty && (
          <button
            type="button"
            onClick={onReset}
            title="Limpar filtros"
            aria-label="Limpar filtros"
            className="rounded-brutal p-1 text-muted-foreground transition-colors hover:bg-void-light hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
