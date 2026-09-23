import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, Coins, Copy, ExternalLink, Film, Layers, Loader2, Printer, ReceiptText } from 'lucide-react'
import { resolveAssetUrl } from '@/lib/api'
import { formatSeconds, printApi, type PrintCardMetadata, type PrintRequestStatus } from '@/lib/api-print'
import { useAuth } from '@/lib/auth-context'
import { useCargos } from '@/lib/cargos-context'
import { useOverlays } from '@/lib/overlay-context'
import { cn } from '@/lib/utils'
import { PrintThumb, gramsLabel } from '@/components/print/print-bits'
import type { CardProps } from './index'
import { CardFrame } from './index'

/**
 * CARTÃO DA IMPRESSORA 3D.
 *
 * Duas caras, pelo `metadata.kind`:
 *
 *   - `job`: a peça ficou pronta. A foto chega segundos depois (a câmera tira
 *     com a luz acesa) e o timelapse quando o servidor termina de montar — o
 *     servidor manda `messageUpdated` e este card se redesenha sozinho. Até
 *     lá, a miniatura do fatiador segura o lugar.
 *   - `request`: uma encomenda no mural, com a oferta em murchos.
 *
 * Os botões respeitam o cargo (`can('print')`), mas quem decide de verdade é
 * o servidor — o botão escondido é conforto, não segurança.
 */
export function PrintCard({ message, metadata }: CardProps<PrintCardMetadata>) {
  if (metadata.kind === 'request') return <RequestCard metadata={metadata} />
  if (metadata.kind === 'job') return <JobCard metadata={metadata} />
  return <p className="text-sm text-foreground">{message.content}</p>
}

// ============================================
// PEÇA PRONTA
// ============================================

function JobCard({ metadata }: { metadata: Extract<PrintCardMetadata, { kind: 'job' }> }) {
  const { token } = useAuth()
  const { can } = useCargos()
  const { openLightbox } = useOverlays()
  const [showVideo, setShowVideo] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [note, setNote] = React.useState<{ ok: boolean; text: string } | null>(null)

  const photo = resolveAssetUrl(metadata.photoUrl ?? undefined)
  const video = resolveAssetUrl(metadata.timelapseUrl ?? undefined)
  const grams = gramsLabel(metadata.grams)

  async function reprint(): Promise<void> {
    setBusy(true)
    setNote(null)
    try {
      const res = await printApi.reprint(token, metadata.jobId)
      setNote({ ok: true, text: res.message })
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : 'Não deu' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <CardFrame
      icon={<Printer className="h-3.5 w-3.5" />}
      title={metadata.requestId ? 'Encomenda entregue' : 'Peça pronta'}
      footer={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {metadata.billedSeconds ? (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatSeconds(metadata.billedSeconds)}
            </span>
          ) : null}
          {grams && <span>{grams}</span>}
          {metadata.layers ? (
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {metadata.layers} camadas
            </span>
          ) : null}
        </span>
      }
    >
      <p className="mb-2 break-words font-display text-base leading-tight text-foreground">{metadata.title}</p>

      {showVideo && video ? (
        <video
          src={video}
          controls
          autoPlay
          loop
          muted
          playsInline
          className="aspect-video w-full rounded-brutal border border-line bg-void object-contain"
        />
      ) : photo ? (
        <button
          type="button"
          onClick={() => openLightbox(photo)}
          className="block w-full overflow-hidden rounded-brutal border border-line bg-void"
          title="Ver a foto grande"
        >
          <img src={photo} alt={metadata.title} className="aspect-video w-full object-cover" loading="lazy" />
        </button>
      ) : (
        <PrintThumb url={metadata.thumbUrl} alt={metadata.title} className="aspect-video w-full" />
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {video && (
          <button
            type="button"
            onClick={() => setShowVideo((v) => !v)}
            className="flex items-center gap-1.5 rounded-brutal border border-line px-2 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-acid-dark hover:text-foreground"
          >
            <Film className="h-3.5 w-3.5" />
            {showVideo ? 'Ver a foto' : 'Ver o timelapse'}
          </button>
        )}
        {!video && !photo && (
          <span className="text-[11.5px] text-muted-foreground">a foto chega em instantes…</span>
        )}
        {metadata.reprintable && can('print') && (
          <button
            type="button"
            onClick={() => void reprint()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-brutal border border-acid-dark px-2 py-1 text-[11.5px] text-acid-text transition-colors hover:bg-acid/10 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
            Quero uma igual
          </button>
        )}
      </div>

      {note && (
        <p className={cn('mt-1.5 text-[11.5px]', note.ok ? 'text-acid-text' : 'text-destructive')}>{note.text}</p>
      )}
    </CardFrame>
  )
}

// ============================================
// ENCOMENDA
// ============================================

const REQUEST_STATUS: Record<PrintRequestStatus, { label: string; tone: string }> = {
  open: { label: 'procurando quem imprima', tone: 'border-burn/50 text-burn' },
  accepted: { label: 'aceita', tone: 'border-acid-dark text-acid-text' },
  printing: { label: 'na fila da impressora', tone: 'border-acid-dark text-acid-text' },
  delivered: { label: 'entregue', tone: 'border-acid/50 text-acid-text' },
  cancelled: { label: 'cancelada', tone: 'border-line text-muted-foreground line-through' }
}

function RequestCard({ metadata }: { metadata: Extract<PrintCardMetadata, { kind: 'request' }> }) {
  const { token, user } = useAuth()
  const { can } = useCargos()
  const navigate = useNavigate()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<{ ok: boolean; text: string } | null>(null)

  const status = REQUEST_STATUS[metadata.status] ?? REQUEST_STATUS.open
  const mine = user?.id === metadata.requesterId
  const makingIt = user?.id === metadata.makerId
  const link = metadata.link && /^https?:\/\//i.test(metadata.link) ? metadata.link : null

  async function run(action: string, fn: () => Promise<{ message: string }>): Promise<void> {
    setBusy(action)
    setNote(null)
    try {
      const res = await fn()
      setNote({ ok: true, text: res.message })
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : 'Não deu' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <CardFrame
      accent={metadata.status === 'open' ? 'burn' : metadata.status === 'cancelled' ? 'muted' : 'acid'}
      icon={<ReceiptText className="h-3.5 w-3.5" />}
      title={`Encomenda de ${metadata.requesterName}`}
      footer={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {metadata.offerCoins > 0 ? (
            <span className="flex items-center gap-1 text-burn">
              <Coins className="h-3 w-3" />
              {metadata.offerCoins} murchos
            </span>
          ) : (
            <span>de graça, na camaradagem</span>
          )}
          {metadata.estimatedSeconds ? <span>{formatSeconds(metadata.estimatedSeconds)}</span> : null}
          {gramsLabel(metadata.estimatedGrams) && <span>{gramsLabel(metadata.estimatedGrams)}</span>}
          {metadata.makerName && <span>quem imprime: {metadata.makerName}</span>}
        </span>
      }
    >
      <div className="flex gap-3">
        {metadata.thumbUrl && <PrintThumb url={metadata.thumbUrl} alt={metadata.title} className="h-16 w-16" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-words font-display text-base leading-tight text-foreground">{metadata.title}</p>
            <span className={cn('rounded-brutal border px-1.5 py-px text-[11px]', status.tone)}>{status.label}</span>
          </div>
          {metadata.detail && (
            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{metadata.detail}</p>
          )}
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-[11.5px] text-acid-text hover:underline"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{link.replace(/^https?:\/\//, '')}</span>
            </a>
          )}
          {!metadata.hasFile && metadata.status !== 'delivered' && metadata.status !== 'cancelled' && (
            <p className="mt-1 text-[11px] text-muted-foreground">sem arquivo fatiado — quem aceitar fatia</p>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {metadata.status === 'open' && !mine && can('print') && (
          <CardButton
            primary
            busy={busy === 'accept'}
            onClick={() => void run('accept', () => printApi.acceptRequest(token, metadata.requestId))}
          >
            Eu imprimo
          </CardButton>
        )}
        {makingIt && metadata.status === 'accepted' && (
          <>
            {metadata.hasFile ? (
              <CardButton
                primary
                busy={busy === 'job'}
                onClick={() => void run('job', () => printApi.requestJob(token, metadata.requestId))}
              >
                Mandar pra fila
              </CardButton>
            ) : (
              <CardButton onClick={() => navigate('/impressao?aba=encomendas')}>Subir o arquivo fatiado</CardButton>
            )}
            <CardButton
              busy={busy === 'abandon'}
              onClick={() => void run('abandon', () => printApi.abandonRequest(token, metadata.requestId))}
            >
              Desistir
            </CardButton>
          </>
        )}
        {mine && (metadata.status === 'open' || metadata.status === 'accepted') && (
          <CardButton
            busy={busy === 'cancel'}
            onClick={() => void run('cancel', () => printApi.cancelRequest(token, metadata.requestId))}
          >
            Cancelar encomenda
          </CardButton>
        )}
      </div>

      {note && (
        <p className={cn('mt-1.5 text-[11.5px]', note.ok ? 'text-acid-text' : 'text-destructive')}>{note.text}</p>
      )}
    </CardFrame>
  )
}

function CardButton({
  children,
  onClick,
  busy,
  primary
}: {
  children: React.ReactNode
  onClick: () => void
  busy?: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        'flex items-center gap-1.5 rounded-brutal border px-2 py-1 text-[11.5px] transition-colors disabled:opacity-60',
        primary
          ? 'border-acid-dark text-acid-text hover:bg-acid/10'
          : 'border-line text-muted-foreground hover:border-line-strong hover:text-foreground'
      )}
    >
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  )
}
