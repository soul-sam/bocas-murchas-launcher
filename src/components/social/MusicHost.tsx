import * as React from 'react'
import {
  ExternalLink,
  ListMusic,
  Loader2,
  Pause,
  Play,
  SkipForward,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X
} from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { cn, formatClock } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { useMembers } from '@/lib/members-context'
import { useSettings } from '@/lib/settings-context'
import { useVoice } from '@/lib/voice-context'
import { useWatch, type WatchSession } from '@/lib/watch-context'
import { openExternal } from '@/lib/rich-text'
import { useYoutubePlayer } from '@/lib/use-youtube-player'
import { YT_STATE, playerErrorInfo, youtubeThumbnail, youtubeWatchUrl } from '@/lib/youtube'

/**
 * A JUKEBOX DA CALL.
 *
 * O mesmo motor do "assistir junto" (a sala manda, o player de cada um
 * obedece), desenhado pra som: sem imagem, numa barra no canto, e — o ponto
 * inteiro — MONTADO FORA DA TELA SOCIAL. Este componente vive no
 * GlobalOverlays do App, que só desmonta no logout.
 *
 * POR QUE ISSO IMPORTA: o palco do vídeo mora dentro do VoiceStage, que mora
 * na SocialPage. Trocar pra tela de jogar desmontava o iframe e a música
 * morria — justamente na hora em que a música serve pra alguma coisa. Aqui
 * ela sobrevive a navegar, minimizar e abrir o Minecraft.
 *
 * O IFRAME NÃO PODE SER `display: none`. Um iframe escondido assim é
 * congelado pelo Chromium e o áudio para. O jeito que funciona (e que o
 * WatchStage já usava no modo barra) é deixá-lo de 1px e transparente: segue
 * renderizado, segue tocando, e não ocupa lugar nenhum na tela.
 *
 * UMA SESSÃO POR CANAL: o servidor não deixa vídeo e música no ar ao mesmo
 * tempo (ver realtime/watch.ts na API), então nunca existem dois iframes
 * disputando o alto-falante. Quando o modo é vídeo, este componente devolve
 * null e quem desenha é o WatchStage.
 */

/**
 * Quanto a música espera pra voltar ao volume cheio depois que a sala cala.
 *
 * Subir na hora faria a música pular a cada respiração no meio de uma frase —
 * o detector de fala já segura 220ms, e mesmo assim uma conversa normal tem
 * silêncios curtos o tempo todo. Descer é instantâneo (ninguém quer ouvir o
 * refrão por cima da primeira sílaba de quem falou); subir é preguiçoso.
 */
const DUCK_RELEASE_MS = 900

/** Arrastar o slider grava no disco só depois que a mão para. */
const VOLUME_SAVE_MS = 400

export function MusicHost() {
  const watch = useWatch()
  const session = watch.current

  // Vídeo é com o WatchStage; sem sessão (ou fora da call) não há o que tocar.
  if (!session || session.mode !== 'music') return null

  return <MusicBar session={session} />
}

function MusicBar({ session }: { session: WatchSession }) {
  const watch = useWatch()
  const voice = useVoice()
  const { user } = useAuth()
  const { byId } = useMembers()
  const { settings, update } = useSettings()

  const [queueOpen, setQueueOpen] = React.useState(false)
  const [muted, setMuted] = React.useState(false)

  // --- volume: imediato na tela, preguiçoso no disco ------------------------
  /**
   * Gravar a cada pixel do slider seria uma enxurrada de read-modify-write no
   * settings.json, e como cada escrita lê o arquivo antes, duas em paralelo se
   * atropelam e uma alteração some. Mesmo motivo (e mesmo remédio) do volume
   * por pessoa em lib/voice-context.
   */
  const [volume, setVolume] = React.useState(() => Math.round(settings.music.volume * 100))
  const pendingRef = React.useRef(false)
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Arquivo mudou (carregou agora, ou outra janela mexeu): adota — a não ser
  // que a minha mão ainda esteja no slider.
  React.useEffect(() => {
    if (pendingRef.current) return
    setVolume(Math.round(settings.music.volume * 100))
  }, [settings.music.volume])

  const musicRef = React.useRef(settings.music)
  musicRef.current = settings.music
  const volumeRef = React.useRef(volume)
  volumeRef.current = volume

  const changeVolume = React.useCallback(
    (next: number) => {
      setVolume(next)
      if (muted && next > 0) setMuted(false)
      pendingRef.current = true
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        pendingRef.current = false
        saveTimerRef.current = null
        void update({ music: { ...musicRef.current, volume: next / 100 } })
      }, VOLUME_SAVE_MS)
    },
    [update, muted]
  )

  // A música pode acabar (ou alguém parar) no meio do atraso da gravação. Sem
  // isso, o último arrasto do slider ia embora com o componente.
  React.useEffect(() => {
    return () => {
      if (!saveTimerRef.current) return
      clearTimeout(saveTimerRef.current)
      void update({ music: { ...musicRef.current, volume: volumeRef.current / 100 } })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- abaixar quando alguém fala -------------------------------------------
  /**
   * O `isSpeaking` vem do medidor local (lib/speaking-detector), que mede o
   * áudio de cada faixa aqui na máquina — acende na primeira sílaba e vale
   * pra todo mundo ao mesmo tempo, não só pros "dominantes" que o servidor
   * escolhe. É por isso que dá pra usá-lo como gatilho de volume: um sinal
   * que chega meio segundo atrasado abaixaria a música depois da frase.
   *
   * A própria voz conta. Quem está falando também não quer se ouvir por cima
   * do refrão.
   */
  const someoneSpeaking = voice.participants.some((participant) => participant.isSpeaking)
  const duckEnabled = settings.music.duck
  const [ducked, setDucked] = React.useState(false)

  React.useEffect(() => {
    if (!duckEnabled) {
      setDucked(false)
      return
    }
    if (someoneSpeaking) {
      setDucked(true)
      return
    }
    const timer = setTimeout(() => setDucked(false), DUCK_RELEASE_MS)
    return () => clearTimeout(timer)
  }, [someoneSpeaking, duckEnabled])

  const effectiveVolume = Math.round(ducked ? volume * settings.music.duckLevel : volume)

  // --- player ---------------------------------------------------------------
  /**
   * Quem avisa o servidor que a faixa acabou: quem pediu, se ainda está na
   * call; senão o primeiro em ordem de identidade, que dá o mesmo nome em
   * todas as máquinas. Sem isso, cinco pessoas mandariam cinco `watch:next` e
   * a fila pularia cinco músicas de uma vez.
   */
  const isDriver = React.useMemo(() => {
    if (!user) return false
    const identities = voice.participants.map((participant) => participant.identity)
    const driver = identities.includes(session.hostUserId)
      ? session.hostUserId
      : [...identities].sort()[0]
    return driver === user.id
  }, [user, voice.participants, session.hostUserId])

  const player = useYoutubePlayer({
    videoId: session.videoId,
    playing: session.playing,
    expectedPosition: () => watch.expectedPosition(session),
    syncKey: session.updatedAt,
    volume: effectiveVolume,
    muted,
    isDriver,
    onEnded: () => {
      if ((session.queue ?? []).length > 0) void watch.next()
      // Fila vazia: a sala precisa saber que parou, senão quem entrar depois
      // calcula uma posição além do fim e cai num player travado.
      else void watch.pause(player.timeRef.current)
    }
  })

  const queue = session.queue ?? []
  const host = byId[session.hostUserId]
  const title = session.title ?? player.playerTitle ?? 'Som do YouTube'
  const art = session.artUrl ?? youtubeThumbnail(session.videoId)
  const errorInfo = playerErrorInfo(player.errorCode)
  const blocked = player.errorCode !== null
  const localPlaying =
    player.playerState === YT_STATE.playing || player.playerState === YT_STATE.buffering

  const togglePlay = (): void => {
    // A sala diz "tocando" e o meu player não está: autoplay barrado ou player
    // recém-carregado. Problema meu — resolve local, sem pausar pra todo mundo.
    if (session.playing && !localPlaying) {
      player.applySession()
      return
    }
    if (session.playing) void watch.pause(player.timeRef.current)
    else void watch.play(player.timeRef.current)
  }

  const progress =
    player.duration > 0 ? Math.min(100, (player.currentTime / player.duration) * 100) : 0

  return (
    <>
      {/*
        O SOM. 1px e transparente, NUNCA `display: none` — escondido assim o
        Chromium congela o iframe e o áudio para. Fica fora do fluxo, então não
        empurra nada na tela.
      */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0"
      >
        <iframe
          key={session.videoId}
          ref={player.iframeRef}
          src={player.iframeSrc}
          title={title}
          allow="autoplay; encrypted-media"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={player.onIframeLoad}
          className="h-full w-full border-0"
        />
      </div>

      {/* A BARRA */}
      <div className="pointer-events-auto fixed bottom-4 right-4 z-40 w-80 overflow-hidden rounded-brutal border-2 border-acid-dark bg-void shadow-[0_0_30px_rgba(0,0,0,0.7)]">
        {queueOpen && (
          <QueuePanel
            queue={queue}
            onClose={() => setQueueOpen(false)}
            onRemove={(index, videoId) => void watch.queueRemove(index, videoId)}
          />
        )}

        {blocked ? (
          <div className="flex flex-col gap-2 p-3">
            <p className="text-sm text-foreground">{errorInfo?.title}</p>
            <p className="text-xs text-muted-foreground">{errorInfo?.body}</p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => openExternal(youtubeWatchUrl(session.videoId))}
                className="flex items-center gap-1.5 rounded-brutal border-2 border-burn/60 px-2 py-1 font-mono text-[11.5px] uppercase tracking-widest text-burn transition-colors hover:bg-burn/10"
              >
                <ExternalLink className="h-3 w-3" />
                Abrir
              </button>
              {queue.length > 0 && (
                <button
                  type="button"
                  onClick={() => void watch.next()}
                  className="flex items-center gap-1.5 rounded-brutal border-2 border-line-strong px-2 py-1 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-acid/50 hover:text-foreground"
                >
                  <SkipForward className="h-3 w-3" />
                  Pular
                </button>
              )}
              <button
                type="button"
                onClick={() => void watch.stop()}
                title="Parar pra todo mundo"
                className="ml-auto rounded-brutal border-2 border-destructive/60 p-1 text-destructive transition-colors hover:bg-destructive/15"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Capa, título, quem pediu */}
            <div className="flex items-center gap-2 p-2">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-brutal border border-line bg-surface-raised">
                <img src={art} alt="" className="h-full w-full object-cover" />
                {!player.ready && (
                  <span className="absolute inset-0 flex items-center justify-center bg-void/70">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-foreground" title={title}>
                  {title}
                </p>
                <p className="truncate text-[11.5px] text-muted-foreground">
                  {session.artist ? `${session.artist} · ` : ''}
                  {host?.displayName ?? 'alguém'} pediu
                </p>
              </div>

              <UserAvatar
                userId={session.hostUserId}
                src={host?.avatar ?? undefined}
                name={host?.displayName ?? 'alguém'}
                ringColor={host?.profileColor}
                className="h-6 w-6 shrink-0"
              />
            </div>

            {/* Quanto já tocou. Só leitura: pra pular tem o botão. */}
            <div className="h-0.5 w-full bg-surface-raised">
              <div className="h-full bg-acid transition-[width]" style={{ width: `${progress}%` }} />
            </div>

            {/* Controles */}
            <div className="flex items-center gap-1.5 p-2">
              <button
                type="button"
                onClick={togglePlay}
                title={session.playing ? 'Pausar pra todo mundo' : 'Dar play pra todo mundo'}
                className="shrink-0 rounded-brutal border-2 border-acid bg-acid/10 p-1 text-acid transition-colors hover:bg-acid/20"
              >
                {session.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={() => void watch.next()}
                disabled={queue.length === 0}
                title={
                  queue.length > 0
                    ? `Próxima: ${queue[0].title ?? queue[0].videoId}`
                    : 'A fila está vazia'
                }
                className="shrink-0 rounded-brutal border-2 border-line p-1 text-muted-foreground transition-colors hover:border-acid/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              >
                <SkipForward className="h-4 w-4" />
              </button>

              <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-muted-foreground">
                {formatClock(player.currentTime)}
              </span>

              <button
                type="button"
                onClick={() => setMuted((value) => !value)}
                title={muted ? 'Voltar o som (só meu)' : 'Mutar a música (só pra mim)'}
                className={cn(
                  'ml-auto shrink-0 transition-colors',
                  muted ? 'text-destructive' : 'text-muted-foreground hover:text-foreground',
                  // Abaixou sozinho porque alguém está falando: o ícone conta,
                  // senão a pessoa mexe no slider achando que o volume caiu.
                  !muted && ducked && 'text-acid'
                )}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>

              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={muted ? 0 : volume}
                onChange={(event) => changeVolume(Number(event.target.value))}
                aria-label="Volume da música (só meu)"
                title={
                  ducked
                    ? `Volume: ${volume}% — abaixado agora porque tem gente falando`
                    : `Volume da música: ${muted ? 0 : volume}% (só pra mim)`
                }
                className={cn('mini-slider w-16 shrink-0', muted && 'is-muted')}
              />

              <button
                type="button"
                onClick={() => setQueueOpen((open) => !open)}
                title={queueOpen ? 'Fechar a fila' : 'Ver a fila'}
                className={cn(
                  'flex shrink-0 items-center gap-1 rounded-brutal border-2 p-1 transition-colors',
                  queueOpen
                    ? 'border-acid bg-acid/10 text-acid'
                    : 'border-line text-muted-foreground hover:border-acid/50 hover:text-foreground'
                )}
              >
                <ListMusic className="h-4 w-4" />
                {queue.length > 0 && (
                  <span className="font-mono text-[11.5px] tabular-nums">{queue.length}</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => void watch.stop()}
                title="Parar a música pra todo mundo"
                className="shrink-0 rounded-brutal border-2 border-destructive/60 p-1 text-destructive transition-colors hover:bg-destructive/15"
              >
                <Square className="h-4 w-4" />
              </button>
            </div>
          </>
        )}

        {watch.feedback && (
          <p className="border-t border-line px-2 py-1 text-[11.5px] text-destructive">
            {watch.feedback}
          </p>
        )}
      </div>
    </>
  )
}

/**
 * A fila.
 *
 * Camada própria, SEM Radix, de propósito: esta barra some sozinha quando
 * alguém para a música, e uma modal do Radix arrancada da árvore com ela
 * aberta deixa `pointer-events: none` grudado no <body> — o app inteiro para
 * de aceitar clique. É o mesmo motivo que levou o QuickSwitcher e o
 * ImageLightbox a serem camadas próprias (ver App.tsx e lib/interaction-guard).
 */
function QueuePanel({
  queue,
  onClose,
  onRemove
}: {
  queue: WatchSession['queue']
  onClose: () => void
  onRemove: (index: number, videoId: string) => void
}) {
  const { byId } = useMembers()
  const items = queue ?? []

  return (
    <div className="border-b-2 border-line">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <ListMusic className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[11.5px] text-muted-foreground">
          {items.length === 0
            ? 'Fila vazia'
            : `${items.length} na fila — um pedido de cada um por vez`}
        </span>
        <button
          type="button"
          onClick={onClose}
          title="Fechar a fila"
          className="ml-auto shrink-0 rounded-brutal p-0.5 text-muted-foreground transition-colors hover:text-dirty-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {items.length === 0 ? (
        <p className="px-2 pb-2 text-[11.5px] text-muted-foreground">
          Procura uma música e manda pra fila — ela entra no rodízio, sem ninguém furar.
        </p>
      ) : (
        <ol className="flex max-h-40 flex-col overflow-y-auto">
          {items.map((item, index) => (
            <li
              key={`${item.videoId}-${index}`}
              className="group flex items-center gap-2 px-2 py-1 hover:bg-void-light"
            >
              <span className="w-4 shrink-0 text-right font-mono text-[11.5px] tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-foreground">
                {item.title ?? item.videoId}
              </span>
              <span className="shrink-0 text-[11.5px] text-muted-foreground">
                {byId[item.addedBy]?.displayName ?? '?'}
              </span>
              <button
                type="button"
                onClick={() => onRemove(index, item.videoId)}
                title="Tirar da fila"
                className="shrink-0 rounded-brutal p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
