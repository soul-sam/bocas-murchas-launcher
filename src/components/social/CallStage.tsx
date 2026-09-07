import * as React from 'react'
import type { Track } from 'livekit-client'
import { Maximize2, MicOff, Minimize2, MonitorUp, Video, Volume2, VolumeX } from 'lucide-react'
import { UserAvatar, frameClass, frameNeedsRing } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { resolveAssetUrl } from '@/lib/api'
import type { VoiceParticipant } from '@/lib/voice-context'
import type { Member } from '@/lib/members-context'
import { useGamification } from '@/lib/gamification-context'
import { TitleIcon } from '@/lib/cosmetic-icons'
import { NameEffect } from './NameEffect'
import { NameEmoji } from './NameEmoji'
import { VideoSurface } from './ScreenStage'

/**
 * PALCO DA CALL — quem está na sala, com ou sem câmera.
 *
 * Saiu do VoiceStage porque a conta de layout aqui não é trivial e estava
 * espalhada em classes soltas.
 *
 * O QUE ESTAVA ERRADO ANTES:
 *
 *  1. O card de câmera tinha largura FIXA (`w-52 sm:w-64`, ~256px no máximo).
 *     Não importava se a janela tinha 1900px de largura e havia uma pessoa só
 *     com câmera aberta: o rosto aparecia num selo de 256px no meio de um
 *     vazio enorme. Com duas câmeras, pior ainda — dois selinhos lado a lado.
 *  2. A moldura comprada na lojinha não aparecia em lugar nenhum da call.
 *  3. O avatar não carregava: a `src` ia como caminho relativo
 *     (`/static/uploads/...`) sem passar por `resolveAssetUrl`, então a imagem
 *     quebrava e o Radix caía no fallback — que são as duas primeiras letras
 *     do nome. Era isso o "só aparece as iniciais dentro da call".
 *
 * COMO É AGORA (o modelo do Discord): TODO MUNDO na call ocupa um card do
 * mesmo tamanho na mesma grade, com câmera ou sem. Quem está só na voz recebe
 * um card 16:9 com o avatar grande no meio; quem abriu a câmera recebe o mesmo
 * card com o vídeo dentro. O tamanho sai de medição real do espaço
 * (`bestTileSize`), então dois numa janela larga viram dois cards enormes lado
 * a lado em vez de dois selinhos no meio do vazio.
 *
 * Antes eram DOIS layouts diferentes — grade só pra quem tinha câmera, e cards
 * verticais de largura fixa pra quem não tinha. Resultado: com ninguém de
 * câmera aberta (o caso mais comum) o palco inteiro ficava vazio com dois
 * cartõezinhos de 176px no meio, e quando alguém abria a câmera o layout
 * inteiro se reorganizava.
 *
 * QUANDO TEM TELA COMPARTILHADA (ou vídeo do YouTube) o palco é da tela, e
 * todo mundo desce pra fileira compacta — quem está compartilhando quer que se
 * olhe a tela, não os rostos. Isso é decidido pelo VoiceStage, que é quem sabe
 * o que mais está no palco.
 *
 * Um clique põe alguém em destaque e joga o resto na fileira.
 */

/** Proporção de webcam. Todo mundo transmite 16:9. */
const ASPECT = 16 / 9
const GAP = 12
/**
 * Nenhum card fica menor que isso. Sem piso, uma call de oito câmeras dividia
 * a altura em quatro fileiras e todo mundo virava uma tarja de 60px. Chegando
 * no piso o palco passa a rolar, que é menos ruim do que ninguém reconhecer
 * ninguém.
 *
 * O piso também é o que impede um vai-e-vem de layout: acima dele a conta
 * sempre cabe na altura medida, então não aparece barra de rolagem; no piso o
 * tamanho não depende mais da medição, então a barra que aparece não encolhe o
 * card (que reencolheria a barra, e assim por diante).
 */
const MIN_TILE_WIDTH = 176
/**
 * Margem de empate na escolha do número de colunas.
 *
 * A conta pura escolhe o card mais largo, e isso dava um resultado certo na
 * matemática e errado na tela: com DUAS câmeras num palco de 900x520,
 * empilhar dá 451px de card e pôr lado a lado dá 444px — 7px, 1,5% de
 * diferença. A conta pura empilhava, e duas pessoas numa call apareciam uma
 * embaixo da outra num palco largo e vazio, que não é o que ninguém espera.
 *
 * Dentro desta margem, ganha a opção com MENOS FILEIRAS. Fora dela a
 * diferença é real e o tamanho manda: num palco estreito, empilhar dá 420px
 * contra 204px, e aí empilhar é obviamente certo.
 */
const TIE_TOLERANCE = 0.08

/**
 * Descobre o tamanho de card que melhor aproveita o espaço.
 *
 * Testa todas as contagens de coluna possíveis e escolhe a que dá o card
 * MAIOR, respeitando 16:9 e o espaço que sobra depois dos vãos. É a mesma
 * conta que o Meet e o Discord fazem: com 2 pessoas numa janela larga, duas
 * colunas ganham; na janela estreita, uma coluna com dois cards empilhados
 * ganha. Fazer isso no CSS exigiria adivinhar pontos de quebra e ainda assim
 * erraria, porque a altura disponível muda conforme tem tela compartilhada,
 * vídeo do YouTube ou nada no palco.
 *
 * Devolve também o número de colunas, e a grade usa EXATAMENTE esse número:
 * deixar o flex-wrap decidir sozinho fazia a tela discordar da conta por
 * causa de um pixel de arredondamento.
 *
 * Exportada e pura pra dar pra testar sem montar componente nenhum.
 */
export function bestTileSize(
  count: number,
  boxWidth: number,
  boxHeight: number
): { width: number; height: number; columns: number } | null {
  if (count <= 0 || boxWidth <= 0 || boxHeight <= 0) return null

  const options: { columns: number; rows: number; width: number }[] = []
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns)
    const cellW = (boxWidth - GAP * (columns - 1)) / columns
    const cellH = (boxHeight - GAP * (rows - 1)) / rows
    if (cellW <= 0 || cellH <= 0) continue
    // O card cabe na célula pelos DOIS lados; manda o lado que aperta mais.
    options.push({ columns, rows, width: Math.min(cellW, cellH * ASPECT) })
  }

  if (options.length === 0) return null

  const widest = Math.max(...options.map((o) => o.width))
  // Entre as que empatam (ver TIE_TOLERANCE), a de menos fileiras.
  const chosen = options
    .filter((o) => o.width >= widest * (1 - TIE_TOLERANCE))
    .reduce((a, b) => (b.rows < a.rows ? b : a))

  const width = Math.max(MIN_TILE_WIDTH, Math.floor(chosen.width))
  return { width, height: Math.floor(width / ASPECT), columns: chosen.columns }
}

/** Mede o espaço disponível e devolve o tamanho de card pra ele. */
function useTileGrid(count: number): {
  ref: React.RefObject<HTMLDivElement>
  width: number | null
  height: number | null
  columns: number | null
} {
  const ref = React.useRef<HTMLDivElement>(null)
  const [box, setBox] = React.useState({ w: 0, h: 0 })

  React.useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      // Arredonda pra inteiro: o ResizeObserver entrega fração de pixel e
      // isso reagendaria render a cada micro-mudança de zoom.
      setBox({ w: Math.floor(rect.width), h: Math.floor(rect.height) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const size = React.useMemo(
    () => bestTileSize(count, box.w, box.h),
    [count, box.w, box.h]
  )

  return {
    ref,
    width: size?.width ?? null,
    height: size?.height ?? null,
    columns: size?.columns ?? null
  }
}

// ============================================
// MOLDURA EM VOLTA DE QUALQUER CAIXA
// ============================================

/**
 * Envolve o conteúdo na moldura comprada na lojinha.
 *
 * Quando não tem moldura, cai numa borda comum que fica verde-ácido enquanto
 * a pessoa fala — o realce de "quem está falando" não pode depender de ter
 * comprado cosmético.
 */
function Framed({
  frame,
  speaking,
  className,
  children
}: {
  frame?: string | null
  speaking?: boolean
  className?: string
  children: React.ReactNode
}) {
  const style = frameClass(frame)

  return (
    <div className="relative min-w-0">
      {frameNeedsRing(frame) && <span aria-hidden className="frame-neon-ring" />}
      <div
        className={cn(
          'relative overflow-hidden rounded-brutal border-2 bg-black',
          style ?? (speaking ? 'border-acid' : 'border-line'),
          className
        )}
      >
        {children}
      </div>
    </div>
  )
}

// ============================================
// NOME + TÍTULO
// ============================================

function ParticipantName({
  participant,
  member,
  className,
  emojiSize = 'sm'
}: {
  participant: VoiceParticipant
  member?: Member
  className?: string
  /** md nos cards grandes, sm na fileira compacta. */
  emojiSize?: 'sm' | 'md'
}) {
  const { cosmeticName } = useGamification()
  const title = cosmeticName(member?.title)

  return (
    <span className={cn('flex min-w-0 items-center gap-1', className)}>
      <NameEffect
        effect={member?.nameEffect}
        className="truncate"
        style={member?.profileColor ? { color: member.profileColor } : undefined}
      >
        {member?.displayName ?? participant.name}
      </NameEffect>
      {/* Ordem combinada em todo canto que mostra alguém: Nome · emoji ·
          Título. O emoji é cosmético COMPRADO — conteúdo que a pessoa
          escolheu, não enfeite da interface — por isso continua emoji. */}
      <NameEmoji id={member?.emoji} size={emojiSize} />

      {participant.isLocal && (
        <span className="shrink-0 text-[11.5px] text-muted-foreground">(você)</span>
      )}
      {/* Só o ícone do título: o nome do título não caberia por cima do vídeo
          sem roubar espaço do nome da pessoa, que é o que importa aqui. */}
      {title && (
        <span title={title} className="shrink-0 text-burn">
          <TitleIcon titleId={member?.title} className="h-2.5 w-2.5" />
        </span>
      )}
    </span>
  )
}

// ============================================
// CONTROLE DE VOLUME
// ============================================

function VolumeControl({
  participant,
  volume,
  onVolume,
  compact,
  className
}: {
  participant: VoiceParticipant
  volume: number
  onVolume: (volume: number) => void
  compact?: boolean
  className?: string
}) {
  const muted = volume === 0

  return (
    <div className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <button
        type="button"
        title={
          muted ? `Voltar a ouvir ${participant.name}` : `Mutar ${participant.name} só pra mim`
        }
        aria-label={muted ? 'Voltar a ouvir' : 'Mutar só pra mim'}
        onClick={() => onVolume(muted ? 1 : 0)}
        className={cn(
          'shrink-0 transition-colors',
          muted ? 'text-destructive' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      </button>

      <input
        type="range"
        min={0}
        max={2}
        step={0.05}
        value={volume}
        onChange={(event) => onVolume(Number(event.target.value))}
        // O duplo clique volta pro padrao: com o maximo em 200% acertar
        // exatamente 100% arrastando e chato.
        onDoubleClick={() => onVolume(1)}
        title={`Volume de ${participant.name}: ${Math.round(volume * 100)}% (2 cliques volta pro padrão)`}
        aria-label={`Volume de ${participant.name}`}
        className={cn('mini-slider min-w-0 flex-1', muted && 'is-muted')}
      />

      {!compact && (
        <span
          className={cn(
            'w-7 shrink-0 text-right font-mono text-[11px]',
            muted ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {Math.round(volume * 100)}
        </span>
      )}
    </div>
  )
}

// ============================================
// CARD DE CÂMERA
// ============================================

interface TileProps {
  participant: VoiceParticipant
  member?: Member
  volume: number
  onVolume: (volume: number) => void
  onContextMenu: (event: React.MouseEvent) => void
}

function CameraTile({
  participant,
  member,
  camera,
  volume,
  onVolume,
  onContextMenu,
  width,
  height,
  spotlighted,
  onToggleSpotlight
}: TileProps & {
  camera: Track
  width: number | null
  height: number | null
  spotlighted: boolean
  onToggleSpotlight: () => void
}) {
  return (
    <div
      onContextMenu={onContextMenu}
      className="group relative min-w-0 shrink-0"
      style={width && height ? { width, height } : undefined}
    >
      <Framed
        frame={member?.avatarFrame}
        speaking={participant.isSpeaking}
        className={cn(
          'h-full w-full transition-shadow',
          // Sem medida ainda (primeiro quadro): a proporção segura o layout
          // até o ResizeObserver responder.
          !width && 'aspect-video w-full min-w-[176px]',
          participant.isSpeaking && 'shadow-[0_0_20px_rgb(var(--neon-rgb)/0.2)]'
        )}
      >
        {/* Espelhado só na própria imagem: é como todo mundo se vê no espelho,
            e vídeo de webcam invertido incomoda quem se olha. */}
        <VideoSurface
          track={camera}
          className={cn('object-cover', participant.isLocal && 'scale-x-[-1]')}
        />

        <TileOverlay
          participant={participant}
          member={member}
          volume={volume}
          onVolume={onVolume}
        />

        {participant.isScreenSharing && (
          <span
            title="Compartilhando tela"
            className="absolute left-2 top-2 rounded-brutal border border-destructive/60 bg-void/90 p-1"
          >
            <MonitorUp className="h-3 w-3 text-destructive" />
          </span>
        )}

        <button
          type="button"
          onClick={onToggleSpotlight}
          title={spotlighted ? 'Voltar pra grade' : 'Colocar em destaque'}
          aria-label={spotlighted ? 'Voltar pra grade' : 'Colocar em destaque'}
          className="absolute right-2 top-2 rounded-brutal bg-void/90 p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover:opacity-100"
        >
          {spotlighted ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </button>
      </Framed>
    </div>
  )
}

// ============================================
// CARD SEM CÂMERA
// ============================================

/**
 * Quem está só na voz: MESMO card 16:9 de quem tem câmera, com o avatar
 * grande no meio.
 *
 * O avatar acompanha o tamanho do card (não é um tamanho fixo em classe): num
 * card de 900px um avatar de 80px pareceria um selo esquecido no meio. 34% da
 * altura é o que deixa o rosto legível sem encostar no nome.
 */
function AvatarTile({
  participant,
  member,
  volume,
  onVolume,
  onContextMenu,
  width,
  height
}: TileProps & { width: number | null; height: number | null }) {
  const avatarPx = height ? Math.round(height * 0.34) : null

  return (
    <div
      onContextMenu={onContextMenu}
      className="group relative min-w-0 shrink-0"
      style={width && height ? { width, height } : undefined}
    >
      <Framed
        frame={member?.avatarFrame}
        speaking={participant.isSpeaking}
        className={cn(
          'flex h-full w-full items-center justify-center bg-void-light/30 transition-shadow',
          !width && 'aspect-video w-full min-w-[176px]',
          participant.isSpeaking && 'shadow-[0_0_20px_rgb(var(--neon-rgb)/0.2)]'
        )}
      >
        <UserAvatar
          src={resolveAssetUrl(member?.avatar ?? participant.avatar)}
          name={member?.displayName ?? participant.name}
          ringColor={member?.profileColor}
          speaking={participant.isSpeaking}
          frame={member?.avatarFrame}
          className="border-2"
          style={
            avatarPx
              ? { width: avatarPx, height: avatarPx }
              : { width: 72, height: 72 }
          }
        />

        <TileOverlay
          participant={participant}
          member={member}
          volume={volume}
          onVolume={onVolume}
        />
      </Framed>
    </div>
  )
}

/**
 * Faixa de baixo do card: nome, mudo, volume. Igual no card de câmera e no de
 * avatar — é o que faz os dois parecerem o mesmo componente pra quem olha.
 *
 * Fica POR CIMA do conteúdo em vez de embaixo do card: antes o nome roubava
 * uma linha de altura de cada card, e com quatro fileiras isso somava um card
 * inteiro de espaço jogado fora.
 */
function TileOverlay({
  participant,
  member,
  volume,
  onVolume
}: {
  participant: VoiceParticipant
  member?: Member
  volume: number
  onVolume: (volume: number) => void
}) {
  const muted = volume === 0

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-void/95 to-transparent px-2 pb-1.5 pt-6">
        <ParticipantName
          participant={participant}
          member={member}
          emojiSize="md"
          className="flex-1 text-sm text-dirty-white"
        />

        {!participant.micEnabled && (
          <MicOff className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="mudo" />
        )}
        {muted && (
          <VolumeX
            className="h-3.5 w-3.5 shrink-0 text-destructive"
            aria-label="mutado só pra mim"
          />
        )}
      </div>

      {!participant.isLocal && (
        <div
          className={cn(
            'absolute inset-x-2 bottom-1 flex items-center transition-opacity',
            // Volume fora do padrão fica SEMPRE visível: sem isso a pessoa
            // abaixava alguém, esquecia, e depois achava que o coleguinha
            // estava com problema de microfone.
            volume !== 1
              ? 'opacity-100'
              : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100'
          )}
        >
          <div className="flex-1 rounded-brutal bg-void/90 px-1.5 py-0.5">
            <VolumeControl
              participant={participant}
              volume={volume}
              onVolume={onVolume}
              compact
            />
          </div>
        </div>
      )}
    </>
  )
}

// ============================================
// FILEIRA COMPACTA
// ============================================

/**
 * Versão horizontal, pra quando o palco está ocupado (tela compartilhada,
 * vídeo do YouTube, ou uma câmera em destaque).
 */
export function ParticipantChip({
  participant,
  member,
  camera,
  volume,
  onVolume,
  onContextMenu,
  onClick
}: TileProps & { camera?: Track; onClick?: () => void }) {
  const muted = volume === 0

  return (
    <div
      onContextMenu={onContextMenu}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-brutal border-2 px-2 py-1',
        participant.isSpeaking ? 'border-acid bg-acid/5' : 'border-line bg-void-light/30'
      )}
    >
      {camera ? (
        <button
          type="button"
          onClick={onClick}
          title={onClick ? `Ver a câmera de ${participant.name}` : undefined}
          className="shrink-0"
        >
          <Framed
            frame={member?.avatarFrame}
            speaking={participant.isSpeaking}
            className="h-7 w-12"
          >
            <VideoSurface
              track={camera}
              className={cn('object-cover', participant.isLocal && 'scale-x-[-1]')}
            />
          </Framed>
        </button>
      ) : (
        <UserAvatar
          src={resolveAssetUrl(member?.avatar ?? participant.avatar)}
          name={member?.displayName ?? participant.name}
          ringColor={member?.profileColor}
          speaking={participant.isSpeaking}
          frame={member?.avatarFrame}
          className="h-6 w-6"
        />
      )}

      <ParticipantName
        participant={participant}
        member={member}
        className="max-w-28 text-sm text-foreground"
      />

      {participant.isScreenSharing && (
        <MonitorUp className="h-3 w-3 shrink-0 text-destructive" aria-label="transmitindo" />
      )}
      {camera && <Video className="h-3 w-3 shrink-0 text-acid" aria-label="câmera ligada" />}
      {!participant.micEnabled && <MicOff className="h-3 w-3 shrink-0 text-destructive" />}

      {!participant.isLocal && (
        <VolumeControl
          participant={participant}
          volume={volume}
          onVolume={onVolume}
          compact
          className={cn('hidden w-24 shrink-0 sm:flex', muted && 'flex')}
        />
      )}
    </div>
  )
}

// ============================================
// PALCO
// ============================================

export interface CallStageProps {
  participants: VoiceParticipant[]
  memberOf: (identity: string) => Member | undefined
  cameraOf: (identity: string) => Track | undefined
  volumeOf: (identity: string) => number
  onVolume: (identity: string, volume: number) => void
  onContextMenu: (event: React.MouseEvent, identity: string) => void
}

export function CallStage({
  participants,
  memberOf,
  cameraOf,
  volumeOf,
  onVolume,
  onContextMenu
}: CallStageProps) {
  /** Identidade em destaque, quando alguém clicou pra ampliar um card. */
  const [spotlight, setSpotlight] = React.useState<string | null>(null)

  /**
   * Destaque de quem saiu da call não pode deixar o palco preso num card
   * vazio. Vale pra qualquer participante, não só pra quem tem câmera —
   * agora todo card é destacável.
   */
  const spotlightValid =
    spotlight !== null && participants.some((p) => p.identity === spotlight)
  React.useEffect(() => {
    if (spotlight !== null && !spotlightValid) setSpotlight(null)
  }, [spotlight, spotlightValid])

  const focused = spotlightValid ? spotlight : null
  const gridParticipants = focused
    ? participants.filter((p) => p.identity === focused)
    : participants

  const grid = useTileGrid(gridParticipants.length)

  const tileFor = (participant: VoiceParticipant): TileProps => ({
    participant,
    member: memberOf(participant.identity),
    volume: volumeOf(participant.identity),
    onVolume: (value: number) => onVolume(participant.identity, value),
    onContextMenu: (event: React.MouseEvent) => onContextMenu(event, participant.identity)
  })

  /** Com alguém em destaque, o resto desce pra fileira compacta. */
  const stripParticipants = focused
    ? participants.filter((p) => p.identity !== focused)
    : []

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/*
        DUAS CAIXAS, cada uma com um trabalho:

        A de fora é o espaço disponível — é ela que o ResizeObserver mede, e
        por isso não pode ter tamanho vindo do conteúdo.

        A de dentro é a grade, com o número de colunas que a conta escolheu.
        Antes era flex-wrap: a quebra ficava a cargo do navegador e discordava
        da conta por um pixel de arredondamento, então às vezes sobrava uma
        fileira com um card sozinho num palco onde caberiam todos.

        `m-auto` em vez de centralizar pelo pai: com `items-center` e conteúdo
        maior que o espaço (piso de tamanho batido, muita gente na call), o
        topo fica inalcançável mesmo com barra de rolagem. Margem automática
        centraliza e continua rolando.
      */}
      <div ref={grid.ref} className="flex min-h-0 flex-1 overflow-auto">
        <div
          className="m-auto grid gap-3"
          style={
            grid.columns
              ? { gridTemplateColumns: `repeat(${grid.columns}, ${grid.width}px)` }
              : undefined
          }
        >
          {gridParticipants.map((participant) => {
            const camera = cameraOf(participant.identity)
            const toggle = (): void =>
              setSpotlight((current) =>
                current === participant.identity ? null : participant.identity
              )

            // Mesmo card, mesmo tamanho: o que muda é o que vai dentro.
            return camera ? (
              <CameraTile
                key={participant.identity}
                {...tileFor(participant)}
                camera={camera}
                width={grid.width}
                height={grid.height}
                spotlighted={focused === participant.identity}
                onToggleSpotlight={toggle}
              />
            ) : (
              <AvatarTile
                key={participant.identity}
                {...tileFor(participant)}
                width={grid.width}
                height={grid.height}
              />
            )
          })}
        </div>
      </div>

      {stripParticipants.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-1.5 sm:gap-2">
          {stripParticipants.map((participant) => (
            <ParticipantChip
              key={participant.identity}
              {...tileFor(participant)}
              camera={cameraOf(participant.identity)}
              onClick={() => setSpotlight(participant.identity)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
