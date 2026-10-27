import * as React from 'react'
import { createPortal } from 'react-dom'
import {
  ExternalLink,
  Link2,
  Loader2,
  Maximize2,
  Megaphone,
  Minimize2,
  MonitorPlay,
  RefreshCw,
  Trash2,
  X
} from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { Arrastavel } from '@/components/ui/arrastavel'
import { ApiError, resolveAssetUrl } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import { useFutebolOpcional, type Tocando } from '@/lib/futebol-context'
import { TIPO_FONTE, futebol, type Fonte, type Jogo } from '@/lib/api-futebol'
import { openExternal } from '@/lib/rich-text'
import { YT_EMBED_ORIGIN, youtubeWatchUrl } from '@/lib/youtube'
import { cn } from '@/lib/utils'
import { Escudo } from './FutebolGlyphs'
import { EstadoDoJogo } from './JogoLinha'

/**
 * ASSISTIR O JOGO — player do YouTube que sobrevive à troca de tela.
 *
 * Só fonte oficial: o radar da API acha a transmissão nos canais que têm o
 * direito de passar de graça (CazéTV, ge tv, Canal GOAT, Paulistão), e a
 * galera pode colar um link do YouTube. Nada de site pirata: além do óbvio,
 * aquilo não roda num iframe sem anúncio malicioso.
 *
 * Dois tamanhos: GRANDE (por cima da tela, com a lista de fontes, quem está
 * assistindo e o "chamar a galera") e MINI (cartão arrastável na fila do
 * canto, pra assistir conversando).
 *
 * O IFRAME NÃO TROCA DE PAI: mudar de grande pra mini recriaria o elemento, e
 * o YouTube recarrega a live do zero (tela preta, anúncio de novo). Ele mora
 * num `fixed` próprio no body e copia, a cada quadro, a caixa do "encaixe" da
 * vez — o retângulo preto do mini ou do grande. Quem está na tela é o
 * encaixe; o vídeo só se alinha em cima dele.
 */

function embedUrl(videoId: string): string {
  const params = new URLSearchParams({ autoplay: '1', playsinline: '1', rel: '0', modestbranding: '1' })
  if (/^https?:$/.test(window.location.protocol)) params.set('origin', window.location.origin)
  return `${YT_EMBED_ORIGIN}/embed/${videoId}?${params.toString()}`
}

export function FutebolPlayer() {
  const futebolCtx = useFutebolOpcional()
  const [encaixe, setEncaixe] = React.useState<HTMLElement | null>(null)
  if (!futebolCtx?.tocando) return null
  const { tocando, grande, setGrande, fecharPlayer, aoVivo } = futebolCtx
  // O placar mais novo é o do socket; o do player é a foto de quando abriu.
  const jogo = aoVivo.find((j) => j.id === tocando.jogo.id) ?? tocando.jogo
  const fonte = tocando.atual
  const tocavel = fonte && fonte.embed ? fonte : null

  return (
    <>
      {grande ? (
        <Grande tocando={tocando} jogo={jogo} encaixe={setEncaixe} onMini={() => setGrande(false)} onFechar={fecharPlayer} />
      ) : (
        <Mini tocando={tocando} jogo={jogo} encaixe={setEncaixe} onGrande={() => setGrande(true)} onFechar={fecharPlayer} />
      )}
      {/* Um degrau ACIMA do cartão: o grande é diálogo (50) e o vídeo sobretela
          (55); o mini é fila (40) e o vídeo diálogo — senão o cartão arrastado,
          que vira portal novo no fim do body, cobriria o próprio vídeo. */}
      {tocavel && <VideoFlutuante videoId={tocavel.videoId} encaixe={encaixe} camada={grande ? 'z-sobretela' : 'z-dialogo'} />}
    </>
  )
}

/** O iframe, colado por cima do encaixe da vez (ver o cabeçalho). */
function VideoFlutuante({ videoId, encaixe, camada }: { videoId: string; encaixe: HTMLElement | null; camada: string }) {
  const caixaRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const caixa = caixaRef.current
    if (!caixa) return
    let quadro = 0
    let ultimo = ''
    const seguir = () => {
      const r = encaixe?.isConnected ? encaixe.getBoundingClientRect() : null
      const chave = r ? `${r.left}|${r.top}|${r.width}|${r.height}` : 'fora'
      if (chave !== ultimo) {
        ultimo = chave
        if (r && r.width > 0) {
          Object.assign(caixa.style, {
            visibility: 'visible',
            left: `${r.left}px`,
            top: `${r.top}px`,
            width: `${r.width}px`,
            height: `${r.height}px`
          })
        } else {
          caixa.style.visibility = 'hidden'
        }
      }
      quadro = requestAnimationFrame(seguir)
    }
    quadro = requestAnimationFrame(seguir)
    return () => cancelAnimationFrame(quadro)
  }, [encaixe])

  return createPortal(
    <div ref={caixaRef} className={cn('fixed overflow-hidden bg-black', camada)} style={{ visibility: 'hidden' }}>
      <iframe
        key={videoId}
        src={embedUrl(videoId)}
        title="Transmissão do jogo"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="h-full w-full border-0"
      />
    </div>,
    document.body
  )
}

/** Placar compacto do cabeçalho: escudos, gols e o minuto. */
function PlacarCurto({ jogo }: { jogo: Jogo }) {
  const temPlacar = jogo.estado !== 'pre' && jogo.casa.gols !== null
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Escudo src={jogo.casa.escudo} sigla={jogo.casa.sigla} cor={jogo.casa.cor} className="h-5 w-5" />
      <span className="truncate text-sm text-foreground">{jogo.casa.sigla}</span>
      {temPlacar ? (
        <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
          {jogo.casa.gols} x {jogo.fora.gols}
        </span>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">x</span>
      )}
      <span className="truncate text-sm text-foreground">{jogo.fora.sigla}</span>
      <Escudo src={jogo.fora.escudo} sigla={jogo.fora.sigla} cor={jogo.fora.cor} className="h-5 w-5" />
      <EstadoDoJogo jogo={jogo} curto className="ml-1 shrink-0" />
    </div>
  )
}

function BotaoIcone({
  rotulo,
  onClick,
  children
}: {
  rotulo: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={rotulo}
      title={rotulo}
      className="shrink-0 rounded-brutal p-1.5 text-muted-foreground transition-colors hover:bg-void-light hover:text-foreground"
    >
      {children}
    </button>
  )
}

/** O retângulo preto onde o vídeo encaixa, ou o aviso de por que não tem vídeo. */
function Tela({ tocando, encaixe }: { tocando: Tocando; encaixe: (el: HTMLElement | null) => void }) {
  const fonte = tocando.atual
  if (fonte?.embed) return <div ref={encaixe} className="aspect-video w-full bg-black" />
  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-black px-4 text-center">
      {tocando.carregando ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      ) : fonte ? (
        <>
          <p className="text-sm text-dirty-white">Esse vídeo só toca no YouTube.</p>
          <button
            type="button"
            onClick={() => openExternal(youtubeWatchUrl(fonte.videoId))}
            className="flex items-center gap-1.5 rounded-brutal border border-acid-dark px-3 py-1.5 text-sm text-acid transition-colors hover:bg-acid/15"
          >
            <ExternalLink className="h-4 w-4" aria-hidden /> Abrir no YouTube
          </button>
        </>
      ) : (
        <>
          <MonitorPlay className="h-7 w-7 text-muted-foreground" aria-hidden />
          <p className="text-sm text-dirty-white">
            {tocando.erro ?? 'Nenhuma transmissão gratuita achada pra esse jogo ainda.'}
          </p>
          <p className="max-w-sm text-[11.5px] text-muted-foreground">
            O radar olha os canais oficiais no YouTube perto do apito. Achou a live? Cola o link do lado.
          </p>
        </>
      )}
    </div>
  )
}

function Mini({
  tocando,
  jogo,
  encaixe,
  onGrande,
  onFechar
}: {
  tocando: Tocando
  jogo: Jogo
  encaixe: (el: HTMLElement | null) => void
  onGrande: () => void
  onFechar: () => void
}) {
  return (
    <Arrastavel chave="bm.futebol.player.posicao" ordem={22}>
      {(alca) => (
        <div className="pointer-events-auto w-[22rem] max-w-full overflow-hidden rounded-brutal border-2 border-acid-dark bg-void shadow-[0_0_30px_rgba(0,0,0,0.7)]">
          <div
            onPointerDown={alca.onPointerDown}
            onDoubleClick={alca.onDoubleClick}
            title={alca.title}
            className={cn('flex items-center gap-1 px-2 py-1.5', alca.className)}
          >
            <div className="min-w-0 flex-1">
              <PlacarCurto jogo={jogo} />
            </div>
            <BotaoIcone rotulo="Aumentar" onClick={onGrande}>
              <Maximize2 className="h-4 w-4" />
            </BotaoIcone>
            <BotaoIcone rotulo="Fechar o jogo" onClick={onFechar}>
              <X className="h-4 w-4" />
            </BotaoIcone>
          </div>
          <Tela tocando={tocando} encaixe={encaixe} />
        </div>
      )}
    </Arrastavel>
  )
}

function Grande({
  tocando,
  jogo,
  encaixe,
  onMini,
  onFechar
}: {
  tocando: Tocando
  jogo: Jogo
  encaixe: (el: HTMLElement | null) => void
  onMini: () => void
  onFechar: () => void
}) {
  // Esc encolhe pro mini (não fecha: quem quer parar o jogo aperta o X).
  React.useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMini()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onMini])

  return createPortal(
    <div
      className="fixed inset-0 z-dialogo flex items-start justify-center overflow-y-auto bg-black/85 p-3 sm:items-center sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onMini()}
    >
      <div
        role="dialog"
        aria-label={`${jogo.casa.nome} x ${jogo.fora.nome}`}
        className="flex w-full max-w-6xl flex-col overflow-hidden rounded-brutal border-2 border-acid-dark bg-void lg:flex-row"
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1 border-b border-line px-3 py-2">
            <div className="min-w-0 flex-1">
              <PlacarCurto jogo={jogo} />
              <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                {[jogo.ligaNome, jogo.fase].filter(Boolean).join(' · ')}
              </p>
            </div>
            <BotaoIcone rotulo="Encolher pro canto (Esc)" onClick={onMini}>
              <Minimize2 className="h-4 w-4" />
            </BotaoIcone>
            <BotaoIcone rotulo="Fechar o jogo" onClick={onFechar}>
              <X className="h-4 w-4" />
            </BotaoIcone>
          </div>
          <Tela tocando={tocando} encaixe={encaixe} />
        </div>
        <Lateral tocando={tocando} jogo={jogo} />
      </div>
    </div>,
    document.body
  )
}

function Lateral({ tocando, jogo }: { tocando: Tocando; jogo: Jogo }) {
  const ctx = useFutebolOpcional()
  const { token, user } = useAuth()
  const { byId } = useMembers()
  const [link, setLink] = React.useState('')
  const [colando, setColando] = React.useState(false)
  const [aviso, setAviso] = React.useState<string | null>(null)
  const [chamou, setChamou] = React.useState(false)
  const quem = ctx?.assistindo[jogo.id] ?? []

  const colar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !link.trim() || colando) return
    setColando(true)
    setAviso(null)
    try {
      const r = await futebol.colarTransmissao(token, jogo.liga, jogo.id, link.trim())
      setLink('')
      await ctx?.recarregarFontes()
      ctx?.trocarFonte(r.fonte)
    } catch (error) {
      setAviso(error instanceof ApiError ? error.message : 'Não deu pra colar o link.')
    } finally {
      setColando(false)
    }
  }

  const tirar = async (f: Fonte) => {
    if (!token) return
    try {
      await futebol.tirarTransmissao(token, jogo.id, f.videoId)
      await ctx?.recarregarFontes()
    } catch (error) {
      setAviso(error instanceof ApiError ? error.message : 'Não deu pra tirar o link.')
    }
  }

  const chamar = async () => {
    if (!token) return
    try {
      await futebol.chamar(token, jogo.liga, jogo.id)
      setChamou(true)
    } catch (error) {
      setAviso(error instanceof ApiError ? error.message : 'Não deu pra chamar a galera.')
    }
  }

  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 border-t border-line p-3 lg:w-80 lg:border-l lg:border-t-0">
      <section>
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Onde assistir</h3>
          <button
            type="button"
            onClick={() => void ctx?.recarregarFontes()}
            aria-label="Procurar de novo"
            title="Procurar de novo"
            className="rounded-brutal p-1 text-muted-foreground transition-colors hover:bg-void-light hover:text-foreground"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', tocando.carregando && 'animate-spin')} />
          </button>
        </div>
        {tocando.fontes.length === 0 ? (
          <p className="text-[11.5px] text-muted-foreground">
            {tocando.carregando ? 'Procurando…' : 'Nada nos canais oficiais por enquanto.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {tocando.fontes.map((f) => {
              const ativa = tocando.atual?.videoId === f.videoId
              const minha = f.origem === 'galera' && (f.por === user?.id || user?.role === 'admin')
              return (
                <li key={f.videoId} className="flex items-stretch gap-1">
                  <button
                    type="button"
                    onClick={() => ctx?.trocarFonte(f)}
                    aria-pressed={ativa}
                    className={cn(
                      'flex min-w-0 flex-1 flex-col rounded-brutal border px-2 py-1.5 text-left transition-colors',
                      ativa ? 'border-acid/60 bg-acid/10' : 'border-line hover:bg-void-light'
                    )}
                  >
                    <span className={cn('text-xs', ativa ? 'text-acid' : 'text-foreground')}>
                      {TIPO_FONTE[f.tipo]}
                      {f.canal ? ` · ${f.canal}` : ''}
                      {!f.embed ? ' · abre no YouTube' : ''}
                    </span>
                    <span className="truncate text-[11.5px] text-muted-foreground" title={f.titulo}>
                      {f.origem === 'galera' && f.por ? `${byId[f.por]?.displayName ?? 'Alguém'} colou: ` : ''}
                      {f.titulo}
                    </span>
                  </button>
                  {minha && (
                    <button
                      type="button"
                      onClick={() => void tirar(f)}
                      aria-label="Tirar o link"
                      title="Tirar o link"
                      className="shrink-0 rounded-brutal px-1.5 text-muted-foreground transition-colors hover:bg-void-light hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {jogo.transmissao && <p className="mt-2 text-[11.5px] text-muted-foreground">Na TV: {jogo.transmissao}</p>}

        <form onSubmit={(e) => void colar(e)} className="mt-2 flex gap-1">
          <label className="sr-only" htmlFor="futebol-colar-link">
            Link do YouTube
          </label>
          <input
            id="futebol-colar-link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Colar link do YouTube"
            className="min-w-0 flex-1 rounded-brutal border border-line bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-acid-dark focus:outline-none"
          />
          <button
            type="submit"
            disabled={colando || !link.trim()}
            aria-label="Colar"
            title="Colar"
            className="shrink-0 rounded-brutal border border-acid-dark px-2 text-acid transition-colors hover:bg-acid/15 disabled:opacity-50"
          >
            {colando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          </button>
        </form>
        {aviso && <p className="mt-1 text-[11.5px] text-destructive">{aviso}</p>}
      </section>

      {tocando.atual && (
        <button
          type="button"
          onClick={() => openExternal(youtubeWatchUrl(tocando.atual!.videoId))}
          className="flex items-center gap-1.5 self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Abrir no YouTube
        </button>
      )}

      <section>
        <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Assistindo agora {quem.length > 0 && <span className="font-mono text-foreground">{quem.length}</span>}
        </h3>
        {quem.length === 0 ? (
          <p className="text-[11.5px] text-muted-foreground">Só você por enquanto.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {quem.map((u) => (
              <li key={u} className="flex items-center gap-1.5 rounded-full border border-line py-0.5 pl-0.5 pr-2">
                <UserAvatar
                  userId={u}
                  src={resolveAssetUrl(byId[u]?.avatar)}
                  name={byId[u]?.displayName ?? '?'}
                  className="h-5 w-5"
                />
                <span className="text-xs text-dirty-white">{byId[u]?.displayName ?? 'Alguém'}</span>
              </li>
            ))}
          </ul>
        )}
        {jogo.estado !== 'post' && (
          <button
            type="button"
            onClick={() => void chamar()}
            disabled={chamou}
            className="mt-2 flex items-center gap-1.5 rounded-brutal border border-acid-dark px-2.5 py-1.5 text-xs text-acid transition-colors hover:bg-acid/15 disabled:opacity-60"
          >
            <Megaphone className="h-3.5 w-3.5" aria-hidden />
            {chamou ? 'Chamado no feed de jogos' : 'Chamar a galera'}
          </button>
        )}
      </section>

      {jogo.lances.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Lances</h3>
          <ol className="flex flex-col gap-1">
            {jogo.lances.map((l, i) => {
              const time = l.timeId === jogo.casa.id ? jogo.casa : l.timeId === jogo.fora.id ? jogo.fora : null
              const tipo = l.tipo === 'vermelho' ? 'vermelho' : l.tipo === 'gol-contra' ? 'gol contra' : l.tipo === 'penalti' ? 'gol de pênalti' : 'gol'
              return (
                <li key={i} className="flex gap-2 text-xs">
                  <span className="w-10 shrink-0 text-right font-mono text-acid-text">{l.minuto}</span>
                  <span className="min-w-0 text-dirty-white">
                    {l.jogador ? (
                      <>
                        {l.jogador} <span className="text-muted-foreground">({tipo}{time ? `, ${time.sigla}` : ''})</span>
                      </>
                    ) : (
                      <span className="first-letter:uppercase">
                        {tipo}
                        {time ? ` do ${time.curto}` : ''}
                      </span>
                    )}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>
      )}
    </aside>
  )
}
