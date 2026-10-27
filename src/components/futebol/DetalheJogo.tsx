import * as React from 'react'
import { ArrowDown, ArrowLeftRight, ArrowUp, Loader2, MonitorPlay, Timer } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { UserAvatar } from '@/components/ui/avatar'
import { resolveAssetUrl } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import {
  dataCurta,
  futebol,
  horaDoJogo,
  palpiteAberto,
  pontosDoPalpite,
  type DetalheJogo as Detalhe,
  type Escalacao,
  type Jogo,
  type Lance,
  type MeuPalpite
} from '@/lib/api-futebol'
import { cn } from '@/lib/utils'
import { Escudo, FutebolIcon } from './FutebolGlyphs'
import { EstadoDoJogo, PalpiteEditor, pontosTom } from './JogoLinha'

/**
 * O JOGO ABERTO: placar grande, e em abas o que a ESPN tiver — lances,
 * estatística, escalação, narração lance a lance — e os palpites da galera
 * (que só aparecem depois do apito, ver lib/futebol/palpites.ts na API).
 *
 * Ao vivo recarrega sozinho a cada 20 s (a API segura 15 s de cache).
 */

type Aba = 'lances' | 'estatisticas' | 'escalacoes' | 'narracao' | 'palpites'

const ABA_NOME: Record<Aba, string> = {
  lances: 'Lances',
  estatisticas: 'Números',
  escalacoes: 'Escalações',
  narracao: 'Lance a lance',
  palpites: 'Palpites'
}

export function DetalheJogoDialog({
  jogo,
  onClose,
  onPalpite
}: {
  jogo: Jogo | null
  onClose: () => void
  onPalpite?: (jogoId: string, palpite: MeuPalpite | null) => void
}) {
  return (
    <Dialog open={!!jogo} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl gap-0 p-0 sm:p-0">
        {jogo && <Conteudo inicial={jogo} onPalpite={onPalpite} />}
      </DialogContent>
    </Dialog>
  )
}

function Conteudo({ inicial, onPalpite }: { inicial: Jogo; onPalpite?: (jogoId: string, p: MeuPalpite | null) => void }) {
  const { token } = useAuth()
  const [det, setDet] = React.useState<Detalhe | null>(null)
  const [erro, setErro] = React.useState<string | null>(null)
  const [aba, setAba] = React.useState<Aba>('lances')

  const carregar = React.useCallback(async () => {
    if (!token) return
    try {
      setDet(await futebol.jogo(token, inicial.liga, inicial.id))
      setErro(null)
    } catch {
      setErro('Sem dados desse jogo agora.')
    }
  }, [token, inicial.liga, inicial.id])

  React.useEffect(() => {
    void carregar()
  }, [carregar])

  const jogo = det?.jogo ?? inicial
  React.useEffect(() => {
    if (jogo.estado !== 'in') return
    const t = setInterval(() => void carregar(), 20_000)
    return () => clearInterval(t)
  }, [jogo.estado, carregar])

  const abas = React.useMemo<Aba[]>(() => {
    const lista: Aba[] = ['lances']
    if (det?.estatisticas.length) lista.push('estatisticas')
    if (det?.escalacoes.length) lista.push('escalacoes')
    if (det?.narracao.length) lista.push('narracao')
    lista.push('palpites')
    return lista
  }, [det])

  const temPlacar = jogo.estado !== 'pre' && jogo.casa.gols !== null

  return (
    <>
      <div className="border-b border-line px-4 pb-3 pt-4 sm:px-6">
        <DialogTitle className="sr-only">
          {jogo.casa.nome} x {jogo.fora.nome}
        </DialogTitle>
        <DialogDescription className="pr-8 text-[11.5px] text-muted-foreground">
          {[jogo.ligaNome, jogo.fase].filter(Boolean).join(' · ')}
        </DialogDescription>

        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <TimeGrande lado={jogo.casa} />
          <div className="flex flex-col items-center gap-1 px-1">
            {temPlacar ? (
              <span className="font-display text-4xl leading-none tabular-nums text-foreground">
                {jogo.casa.gols} <span className="text-muted-foreground">x</span> {jogo.fora.gols}
              </span>
            ) : (
              <span className="font-display text-3xl leading-none text-foreground">{horaDoJogo(jogo.inicio)}</span>
            )}
            {jogo.casa.penaltis !== null && jogo.fora.penaltis !== null && (
              <span className="text-[11.5px] text-muted-foreground">
                pênaltis {jogo.casa.penaltis} x {jogo.fora.penaltis}
              </span>
            )}
            {jogo.estado === 'pre' ? (
              <span className="text-[11.5px] text-muted-foreground">{dataCurta(jogo.inicio)}</span>
            ) : (
              <EstadoDoJogo jogo={jogo} />
            )}
          </div>
          <TimeGrande lado={jogo.fora} />
        </div>

        <p className="mt-3 text-center text-[11.5px] text-muted-foreground">
          {[jogo.estadio, jogo.cidade].filter(Boolean).join(', ')}
          {jogo.transmissao && ` · ${jogo.transmissao}`}
          {det?.publico ? ` · ${det.publico.toLocaleString('pt-BR')} pagantes` : ''}
          {det?.arbitro ? ` · árbitro ${det.arbitro}` : ''}
        </p>
      </div>

      <div role="tablist" aria-label="Partes do jogo" className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-3 py-2">
        {abas.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={aba === id}
            onClick={() => setAba(id)}
            className={cn(
              'shrink-0 rounded-brutal border px-2.5 py-1 text-xs transition-colors',
              aba === id
                ? 'border-acid/60 bg-acid/10 text-acid'
                : 'border-transparent text-muted-foreground hover:bg-void-light hover:text-foreground'
            )}
          >
            {ABA_NOME[id]}
          </button>
        ))}
      </div>

      <div className="min-h-[12rem] flex-1 overflow-y-auto px-4 py-3 sm:px-6">
        {!det && !erro && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {erro && !det && <p className="py-6 text-center text-sm text-muted-foreground">{erro}</p>}
        {det && aba === 'lances' && <Lances det={det} />}
        {det && aba === 'estatisticas' && <Numeros det={det} />}
        {det && aba === 'escalacoes' && <Escalacoes det={det} />}
        {det && aba === 'narracao' && (
          <ol className="flex flex-col gap-2">
            {det.narracao.map((n, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="w-12 shrink-0 text-right font-mono text-[11.5px] text-acid-text">{n.minuto}</span>
                <span className="text-dirty-white">{n.texto}</span>
              </li>
            ))}
          </ol>
        )}
        {det && aba === 'palpites' && (
          <Palpites
            det={det}
            onPalpite={(p) => {
              setDet((d) => (d ? { ...d, palpites: { ...d.palpites, meu: p, total: d.palpites.total + (p && !d.palpites.meu ? 1 : !p && d.palpites.meu ? -1 : 0) } } : d))
              onPalpite?.(jogo.id, p)
            }}
          />
        )}
      </div>
    </>
  )
}

function TimeGrande({ lado }: { lado: Jogo['casa'] }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <Escudo src={lado.escudo} sigla={lado.sigla} cor={lado.cor} className="h-12 w-12 sm:h-14 sm:w-14" />
      <span className="max-w-full truncate text-sm text-foreground">{lado.curto}</span>
      {lado.forma && <Forma forma={lado.forma} />}
    </div>
  )
}

/** "VVEDV" em quadradinhos. A ESPN manda W/D/L; aceitamos os dois. */
export function Forma({ forma }: { forma: string }) {
  const letras = forma
    .toUpperCase()
    .split('')
    .slice(-5)
    .map((c) => (c === 'W' ? 'V' : c === 'L' ? 'D' : c === 'D' ? 'E' : c))
  return (
    <span className="flex gap-0.5" aria-label={`Últimos jogos: ${letras.join(' ')}`}>
      {letras.map((l, i) => (
        <span
          key={i}
          className={cn(
            'flex h-4 w-4 items-center justify-center rounded-[3px] font-mono text-[11px] leading-none',
            l === 'V' ? 'bg-acid/20 text-acid' : l === 'D' ? 'bg-destructive/20 text-destructive' : 'bg-surface-raised text-muted-foreground'
          )}
        >
          {l}
        </span>
      ))}
    </span>
  )
}

function IconeDoLance({ lance }: { lance: Lance }) {
  switch (lance.categoria) {
    case 'gol':
      return <FutebolIcon className="h-3.5 w-3.5 text-acid" />
    case 'amarelo':
      return <span aria-label="Amarelo" className="block h-3.5 w-2.5 rounded-[2px] bg-burn" />
    case 'vermelho':
      return <span aria-label="Vermelho" className="block h-3.5 w-2.5 rounded-[2px] bg-destructive" />
    case 'troca':
      return <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
    case 'var':
      return <MonitorPlay className="h-3.5 w-3.5 text-muted-foreground" />
    default:
      return <Timer className="h-3.5 w-3.5 text-muted-foreground" />
  }
}

/** "Gol: Bernard (assistência de Preciado)", "Substituição: Fulano por Beltrano". */
function textoDoLance(l: Lance): string {
  const [primeiro, segundo] = l.jogadores
  if (!primeiro) return l.texto || l.tipo
  if (l.categoria === 'gol') return `${l.tipo}: ${primeiro}${segundo ? ` (assistência de ${segundo})` : ''}`
  if (l.categoria === 'troca') return `${l.tipo}: ${primeiro}${segundo ? ` por ${segundo}` : ''}`
  if (l.categoria === 'amarelo' || l.categoria === 'vermelho') return `${l.tipo}: ${primeiro}`
  return l.texto || l.tipo
}

function Lances({ det }: { det: Detalhe }) {
  const lances = det.lances.filter((l) => l.categoria !== 'outro' || l.texto)
  if (lances.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nenhum lance ainda.</p>
  }
  return (
    <ol className="flex flex-col gap-1.5">
      {lances.map((l, i) => {
        const fora = l.timeId === det.jogo.fora.id
        return (
          <li
            key={i}
            className={cn(
              'flex items-start gap-2.5 rounded-brutal px-2 py-1.5',
              l.categoria === 'gol' && 'bg-acid/5',
              fora && 'flex-row-reverse text-right'
            )}
          >
            <span className="w-11 shrink-0 pt-0.5 font-mono text-[11.5px] text-muted-foreground">{l.minuto}</span>
            <span className="shrink-0 pt-0.5">
              <IconeDoLance lance={l} />
            </span>
            <span className={cn('min-w-0 flex-1 text-sm', l.categoria === 'gol' ? 'text-foreground' : 'text-dirty-white')}>
              {textoDoLance(l)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Numeros({ det }: { det: Detalhe }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{det.jogo.casa.curto}</span>
        <span>{det.jogo.fora.curto}</span>
      </div>
      {det.estatisticas.map((e) => (
        <div key={e.chave} className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-mono tabular-nums text-foreground">{e.casa}</span>
            <span className="text-xs text-muted-foreground">{e.nome}</span>
            <span className="font-mono tabular-nums text-foreground">{e.fora}</span>
          </div>
          {e.fatiaCasa !== null && (
            <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-raised">
              <div className="bg-acid" style={{ width: `${Math.round(e.fatiaCasa * 100)}%` }} />
              <div className="flex-1 bg-burn/70" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function Escalacoes({ det }: { det: Detalhe }) {
  const lados = [det.jogo.casa, det.jogo.fora]
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {lados.map((lado) => {
        const esc = det.escalacoes.find((e) => e.timeId === lado.id)
        return (
          <section key={lado.id}>
            <h3 className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              <Escudo src={lado.escudo} sigla={lado.sigla} cor={lado.cor} className="h-4 w-4" />
              {lado.curto}
              {esc?.formacao && <span className="text-acid-text">{esc.formacao}</span>}
            </h3>
            {esc ? <ListaJogadores esc={esc} /> : <p className="text-sm text-muted-foreground">Sem escalação.</p>}
          </section>
        )
      })}
    </div>
  )
}

function ListaJogadores({ esc }: { esc: Escalacao }) {
  const linha = (j: Escalacao['titulares'][number]) => (
    <li key={`${j.numero}-${j.nome}`} className="flex items-center gap-2 text-sm">
      <span className="w-6 shrink-0 text-right font-mono text-[11.5px] text-muted-foreground">{j.numero ?? ''}</span>
      <span className={cn('min-w-0 flex-1 truncate', j.titular ? 'text-foreground' : 'text-dirty-white')}>{j.nome}</span>
      {j.posicao && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{j.posicao}</span>}
      {j.saiu && <ArrowDown className="h-3 w-3 shrink-0 text-destructive" aria-label="Saiu" />}
      {j.entrou && <ArrowUp className="h-3 w-3 shrink-0 text-acid" aria-label="Entrou" />}
    </li>
  )
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1">{esc.titulares.map(linha)}</ul>
      {esc.reservas.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Banco ({esc.reservas.length})
          </summary>
          <ul className="mt-1 flex flex-col gap-1">{esc.reservas.map(linha)}</ul>
        </details>
      )}
    </div>
  )
}

function Palpites({ det, onPalpite }: { det: Detalhe; onPalpite: (p: MeuPalpite | null) => void }) {
  const { byId } = useMembers()
  const { jogo, palpites } = det
  const aberto = palpiteAberto(jogo)
  const temPlacar = jogo.estado !== 'pre' && jogo.casa.gols !== null && jogo.fora.gols !== null

  return (
    <div className="flex flex-col gap-3">
      {aberto && (
        <div className="overflow-hidden rounded-brutal border border-line">
          <PalpiteEditor jogo={jogo} atual={palpites.meu} onSalvo={onPalpite} />
        </div>
      )}
      {!palpites.todos ? (
        <p className="text-sm text-muted-foreground">
          {palpites.total === 0
            ? 'Ninguém palpitou ainda.'
            : `${palpites.total} ${palpites.total === 1 ? 'palpite' : 'palpites'} da galera. Aparecem quando a bola rolar.`}
        </p>
      ) : palpites.todos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguém palpitou nesse jogo.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {[...palpites.todos]
            .map((p) => ({
              ...p,
              vale: p.points ?? (temPlacar ? pontosDoPalpite(p, { home: jogo.casa.gols!, away: jogo.fora.gols! }) : null)
            }))
            .sort((a, b) => (b.vale ?? 0) - (a.vale ?? 0))
            .map((p) => {
              const m = byId[p.userId]
              return (
                <li key={p.userId} className="flex items-center gap-2.5 rounded-brutal px-2 py-1.5">
                  <UserAvatar
                    userId={p.userId}
                    src={resolveAssetUrl(m?.avatar)}
                    name={m?.displayName ?? '?'}
                    ringColor={m?.profileColor ?? undefined}
                    className="h-7 w-7"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{m?.displayName ?? 'Alguém'}</span>
                  <span className="font-mono text-sm text-foreground">
                    {p.home} x {p.away}
                  </span>
                  {p.vale !== null && (
                    <span className={cn('w-14 rounded-brutal border px-1.5 py-0.5 text-center font-mono text-[11.5px]', pontosTom(p.vale))}>
                      {p.points !== null ? `+${p.vale}` : `${p.vale}?`}
                    </span>
                  )}
                </li>
              )
            })}
        </ul>
      )}
    </div>
  )
}
