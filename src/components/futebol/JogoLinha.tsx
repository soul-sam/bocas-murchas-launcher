import * as React from 'react'
import { Loader2, Minus, Plus, Trash2 } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import {
  GOLS_MAX,
  PONTOS,
  futebol,
  horaDoJogo,
  palpiteAberto,
  pontosDoPalpite,
  type Jogo,
  type MeuPalpite,
  type PalpitesDoJogo
} from '@/lib/api-futebol'
import { cn } from '@/lib/utils'
import { Escudo } from './FutebolGlyphs'

/**
 * UM JOGO NUMA LINHA: horário (ou minuto, ao vivo), os dois times com escudo,
 * o placar e o MEU palpite — que é o que faz a pessoa voltar na tela.
 *
 * Antes do apito, o palpite edita ali mesmo (abre uma faixa embaixo da linha):
 * abrir o detalhe pra palpitar seria um clique a mais por jogo numa rodada de
 * dez. Clicar no resto da linha abre o detalhe.
 */

export function pontosTom(pontos: number): string {
  if (pontos >= PONTOS.exato) return 'border-acid bg-acid/15 text-acid'
  if (pontos >= PONTOS.resultado) return 'border-acid-dark bg-acid/5 text-acid-text'
  return 'border-line text-muted-foreground'
}

/** Na linha a coluna do status tem 48px: "Encerrado nos pênaltis" quebrava em três. */
const ROTULO_CURTO: Record<string, string> = {
  '': 'Fim',
  Encerrado: 'Fim',
  'Encerrado nos pênaltis': 'Fim (pên.)',
  'Encerrado na prorrogação': 'Fim (prorr.)',
  Abandonado: 'Abandon.'
}

export function EstadoDoJogo({ jogo, className, curto }: { jogo: Jogo; className?: string; curto?: boolean }) {
  if (jogo.estado === 'in') {
    return (
      <span className={cn('flex items-center gap-1 font-mono text-[11.5px] text-destructive', className)}>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" aria-hidden />
        {jogo.rotulo || 'ao vivo'}
      </span>
    )
  }
  if (jogo.estado === 'post') {
    return (
      <span className={cn('text-[11.5px] text-muted-foreground', className)} title={jogo.rotulo || 'Encerrado'}>
        {curto ? ROTULO_CURTO[jogo.rotulo] ?? jogo.rotulo : jogo.rotulo || 'Encerrado'}
      </span>
    )
  }
  return <span className={cn('font-mono text-[11.5px] text-foreground', className)}>{horaDoJogo(jogo.inicio)}</span>
}

export function JogoLinha({
  jogo,
  palpites,
  destaque,
  onAbrir,
  onPalpite,
  comData
}: {
  jogo: Jogo
  palpites: PalpitesDoJogo | undefined
  /** Jogo do meu time: borda acesa. */
  destaque?: boolean
  onAbrir?: (jogo: Jogo) => void
  onPalpite?: (jogoId: string, palpite: MeuPalpite | null) => void
  /** Mostra a data além da hora (listas de vários dias). */
  comData?: boolean
}) {
  const [editando, setEditando] = React.useState(false)
  const meu = palpites?.meu ?? null
  const aberto = palpiteAberto(jogo)
  const temPlacar = jogo.estado !== 'pre' && jogo.casa.gols !== null && jogo.fora.gols !== null
  const valendo =
    meu && temPlacar ? meu.points ?? pontosDoPalpite(meu, { home: jogo.casa.gols!, away: jogo.fora.gols! }) : null

  return (
    <li
      className={cn(
        'overflow-hidden rounded-brutal border bg-void/60',
        destaque ? 'border-acid-dark' : 'border-line'
      )}
    >
      <div className="flex items-center gap-2 px-2.5 py-2 sm:gap-3 sm:px-3">
        <button
          type="button"
          onClick={() => onAbrir?.(jogo)}
          disabled={!onAbrir}
          className="flex min-w-0 flex-1 items-center gap-2 text-left sm:gap-3"
          aria-label={`${jogo.casa.nome} x ${jogo.fora.nome}: abrir detalhes`}
        >
          <div className="flex w-12 shrink-0 flex-col items-start leading-tight">
            {comData && (
              <span className="text-[11px] text-muted-foreground">
                {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }).format(
                  new Date(jogo.inicio)
                )}
              </span>
            )}
            <EstadoDoJogo jogo={jogo} curto />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Time lado={jogo.casa} venceu={jogo.estado === 'post' && jogo.casa.vencedor} placar={temPlacar} />
            <Time lado={jogo.fora} venceu={jogo.estado === 'post' && jogo.fora.vencedor} placar={temPlacar} />
          </div>
        </button>

        <div className="flex w-[4.75rem] shrink-0 flex-col items-end gap-1">
          {meu ? (
            <button
              type="button"
              disabled={!aberto}
              onClick={() => setEditando((v) => !v)}
              title={aberto ? 'Trocar palpite' : 'Seu palpite'}
              className={cn(
                'rounded-brutal border px-1.5 py-0.5 font-mono text-xs transition-colors',
                valendo !== null ? pontosTom(valendo) : 'border-acid-dark text-acid-text',
                aberto && 'hover:bg-acid/10'
              )}
            >
              {meu.home} x {meu.away}
            </button>
          ) : aberto && onPalpite ? (
            <button
              type="button"
              onClick={() => setEditando((v) => !v)}
              className="rounded-brutal border border-acid-dark px-2 py-0.5 text-xs text-acid transition-colors hover:bg-acid/15"
            >
              palpitar
            </button>
          ) : null}
          {valendo !== null && (
            <span className="text-[11px] text-muted-foreground">
              {meu?.points !== null && meu?.points !== undefined ? `+${valendo} pts` : `valendo ${valendo}`}
            </span>
          )}
          {valendo === null && !!palpites?.total && (
            <span className="text-[11px] text-muted-foreground">
              {palpites.total} {palpites.total === 1 ? 'palpite' : 'palpites'}
            </span>
          )}
        </div>
      </div>

      {editando && aberto && onPalpite && (
        <PalpiteEditor
          jogo={jogo}
          atual={meu}
          onSalvo={(p) => {
            onPalpite(jogo.id, p)
            setEditando(false)
          }}
        />
      )}
    </li>
  )
}

function Time({ lado, venceu, placar }: { lado: Jogo['casa']; venceu: boolean; placar: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Escudo src={lado.escudo} sigla={lado.sigla} cor={lado.cor} className="h-5 w-5" />
      <span className={cn('min-w-0 flex-1 truncate text-sm', venceu ? 'text-foreground' : 'text-dirty-white')}>
        {lado.curto}
      </span>
      {placar && (
        <span className={cn('shrink-0 font-mono text-sm tabular-nums', venceu ? 'text-acid' : 'text-foreground')}>
          {lado.gols}
          {lado.penaltis !== null && <span className="ml-0.5 text-[11px] text-muted-foreground">({lado.penaltis})</span>}
        </span>
      )}
    </div>
  )
}

/** A faixa de palpitar: dois contadores e salvar. */
export function PalpiteEditor({
  jogo,
  atual,
  onSalvo
}: {
  jogo: Jogo
  atual: MeuPalpite | null
  onSalvo: (palpite: MeuPalpite | null) => void
}) {
  const { token } = useAuth()
  const [casa, setCasa] = React.useState(atual?.home ?? 1)
  const [fora, setFora] = React.useState(atual?.away ?? 0)
  const [salvando, setSalvando] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)

  const salvar = async () => {
    if (!token) return
    setSalvando(true)
    setErro(null)
    try {
      onSalvo(await futebol.palpitar(token, { liga: jogo.liga, jogoId: jogo.id, home: casa, away: fora }))
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não deu pra salvar o palpite.')
    } finally {
      setSalvando(false)
    }
  }

  const tirar = async () => {
    if (!token) return
    setSalvando(true)
    setErro(null)
    try {
      await futebol.desistir(token, jogo.id)
      onSalvo(null)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não deu pra tirar o palpite.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="border-t border-line bg-void-light/40 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Contador nome={jogo.casa.curto} valor={casa} onChange={setCasa} />
        <span className="font-mono text-sm text-muted-foreground">x</span>
        <Contador nome={jogo.fora.curto} valor={fora} onChange={setFora} />
        <div className="ml-auto flex items-center gap-1.5">
          {atual && (
            <button
              type="button"
              onClick={() => void tirar()}
              disabled={salvando}
              aria-label="Tirar palpite"
              title="Tirar palpite"
              className="rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={salvando}
            className="flex items-center gap-1.5 rounded-brutal border-2 border-acid bg-acid px-3 py-1 text-xs font-medium text-void transition-colors hover:bg-acid/90 disabled:opacity-60"
          >
            {salvando && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
            {atual ? 'Trocar' : 'Palpitar'}
          </button>
        </div>
      </div>
      {erro && <p className="mt-1.5 text-[11.5px] text-destructive">{erro}</p>}
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Placar exato {PONTOS.exato} pts · vencedor e saldo {PONTOS.saldo} · só o vencedor {PONTOS.resultado}. Fecha no
        apito inicial.
      </p>
    </div>
  )
}

function Contador({ nome, valor, onChange }: { nome: string; valor: number; onChange: (v: number) => void }) {
  const mudar = (d: number) => onChange(Math.max(0, Math.min(GOLS_MAX, valor + d)))
  return (
    <div className="flex items-center gap-1" aria-label={`Gols do ${nome}`}>
      <span className="hidden max-w-[6rem] truncate text-xs text-muted-foreground sm:inline">{nome}</span>
      <button
        type="button"
        onClick={() => mudar(-1)}
        aria-label={`Menos um gol do ${nome}`}
        className="alvo-dedo rounded-brutal border border-line p-1 text-muted-foreground transition-colors hover:bg-void-light hover:text-foreground"
      >
        <Minus className="h-3 w-3" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={GOLS_MAX}
        value={valor}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(Math.max(0, Math.min(GOLS_MAX, Math.trunc(n))))
        }}
        className="h-7 w-9 rounded-brutal border border-line bg-void text-center font-mono text-sm text-foreground [appearance:textfield] focus:border-acid focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => mudar(1)}
        aria-label={`Mais um gol do ${nome}`}
        className="alvo-dedo rounded-brutal border border-line p-1 text-muted-foreground transition-colors hover:bg-void-light hover:text-foreground"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  )
}
