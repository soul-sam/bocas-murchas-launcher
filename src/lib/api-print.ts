import { request, upload } from './api'

/**
 * Fila de impressão 3D — a Kobra S1 que o grupo comprou em rateio.
 *
 * Os tipos aqui espelham o que `/api/print/*` devolve, igual api-polls.ts faz
 * com as enquetes.
 *
 * Duas coisas que a UI **não** faz, de propósito:
 *
 * 1. **Não recalcula a regra de justiça.** A posição na fila e o motivo dela
 *    (`reasonText`) vêm prontos do servidor. Se a tela recalculasse, existiriam
 *    duas fontes de verdade e elas divergiriam num domingo à noite — e a
 *    primeira coisa que alguém do grupo faria era abrir uma discussão sobre
 *    qual das duas está certa.
 * 2. **Não estima nada.** O tempo e as gramas saem do arquivo, lidos pelo
 *    servidor. O launcher é código do usuário; a estimativa é a moeda da cota.
 */

export type PrintJobStatus =
  | 'queued'
  | 'dispatching'
  | 'sent'
  | 'starting'
  | 'printing'
  | 'paused'
  | 'cancelling'
  | 'cancelled'
  | 'finished'
  | 'failed'

export type BlockedReason =
  | 'quota'
  | 'bed_dirty'
  | 'agent_offline'
  | 'printer_busy'
  | 'printer_error'
  | 'needs_approval'
  | 'autostart_off'
  | 'quiet_hours'
  | 'printer_disabled'

export interface PrintOwner {
  id: string
  displayName: string
  username?: string
  avatar?: string | null
  profileColor?: string | null
}

export interface PrintQueueItem {
  id: string
  title: string
  note: string | null
  status: PrintJobStatus
  printerPhase: string | null
  owner: PrintOwner
  estimatedSeconds: number
  estimatedGrams: number | null
  layers: number | null
  position: number
  reason: string
  /** Frase pronta em português explicando a posição. Vem do servidor. */
  reasonText: string
  eligible: boolean
  blockedReason: BlockedReason | null
  blockedText: string | null
  etaStartAt: string | null
  etaFinishAt: string | null
  queuedAt: string
}

export interface PrintRunning {
  id: string
  title: string
  status: PrintJobStatus
  printerPhase: string | null
  owner: PrintOwner
  progress: number
  currLayer: number | null
  totalLayers: number | null
  remainSeconds: number | null
  estimatedSeconds: number
  startedAt: string | null
  /** Paramos de receber telemetria — a peça provavelmente continua. */
  telemetryStale: boolean
}

export interface PrinterInfo {
  id: string
  name: string
  model: string
  state: string
  printerPhase: string | null
  bedClear: boolean
  bedDirtySince: string | null
  agentOnline: boolean
  agentLastSeenAt: string | null
  autoStart: boolean
  lastErrorCode: number | null
  lastErrorMessage: string | null
  acceptedFilaments: string[]
  maxJobSeconds: number
  maxQueuedJobs: number
  defaultWindowSeconds: number
}

export interface PrintQuota {
  quotaSeconds: number
  usedSeconds: number
  reservedSeconds: number
  availableSeconds: number
  overSeconds: number
  liveJobs: number
  windowDays: number
  nextReleaseAt: string | null
  nextReleaseSeconds: number
}

export interface PrintState {
  me: { canQueue: boolean; canOperate: boolean; isAdmin: boolean }
  printer: PrinterInfo
  running: PrintRunning | null
  queue: PrintQueueItem[]
  globalBlock: BlockedReason | null
  globalBlockText: string | null
  quota: PrintQuota
}

export interface PrintHistoryItem {
  id: string
  title: string
  status: PrintJobStatus
  owner: PrintOwner
  fileName: string
  estimatedSeconds: number
  billedSeconds: number | null
  refundedSeconds: number
  actualGrams: number | null
  estimatedGrams: number | null
  failureCause: string | null
  printerErrorCode: number | null
  startedAt: string | null
  finishedAt: string | null
}

export interface PrintUsageRow extends PrintQuota {
  user: PrintOwner
}

export interface PrintAccessRow {
  user: PrintOwner & { role: string }
  canQueue: boolean
  canOperate: boolean
  windowSeconds: number | null
  effectiveWindowSeconds: number
  maxQueuedJobs: number | null
  priority: number
  requiresApproval: boolean
  driftStrikes: number
  notes: string | null
  usedSeconds: number
  reservedSeconds: number
}

export interface EnqueueResult {
  message: string
  job: PrintQueueItem | null
  deduped: boolean
  warnings: string[]
  quota: PrintQuota
}

export const printApi = {
  state: (token: string | null) => request<PrintState>('/print/state', { token }),

  queue: (token: string | null) =>
    request<{ queue: PrintQueueItem[]; running: PrintRunning | null; globalBlock: BlockedReason | null }>(
      '/print/queue',
      { token }
    ),

  quota: (token: string | null) => request<PrintQuota>('/print/quota', { token }),

  usage: (token: string | null) => request<{ usage: PrintUsageRow[] }>('/print/usage', { token }),

  history: (token: string | null, mine = false) =>
    request<{ jobs: PrintHistoryItem[] }>(`/print/jobs${mine ? '?mine=1' : ''}`, { token }),

  /**
   * Sobe um arquivo já fatiado. O `title` é só o nome que aparece na fila; o
   * tempo e as gramas o servidor tira do próprio arquivo.
   */
  enqueue: (token: string | null, file: File, options: { title?: string; note?: string } = {}) => {
    const form = new FormData()
    form.append('file', file)
    if (options.title) form.append('title', options.title)
    if (options.note) form.append('note', options.note)
    return upload<EnqueueResult>('/print/jobs', form, token)
  },

  cancel: (token: string | null, jobId: string, reason?: string) =>
    request<{ message: string; quota: PrintQuota }>(`/print/jobs/${jobId}`, {
      method: 'DELETE',
      token,
      body: JSON.stringify({ reason })
    }),

  bedClear: (token: string | null) =>
    request<{ message: string }>('/print/bed-clear', { method: 'POST', token, body: '{}' }),

  control: (token: string | null, action: 'pause' | 'resume' | 'stop') =>
    request<{ message: string }>('/print/control', {
      method: 'POST',
      token,
      body: JSON.stringify({ action })
    }),

  // ---- admin ----
  listAccess: (token: string | null) =>
    request<{ members: PrintAccessRow[]; printer: { defaultWindowSeconds: number } }>(
      '/print/admin/access',
      { token }
    ),

  setAccess: (
    token: string | null,
    userId: string,
    patch: Partial<{
      canQueue: boolean
      canOperate: boolean
      windowSeconds: number | null
      maxQueuedJobs: number | null
      priority: number
      requiresApproval: boolean
      notes: string
    }>
  ) =>
    request<{ message: string }>(`/print/admin/access/${userId}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(patch)
    }),

  grantHours: (token: string | null, userId: string, seconds: number, reason: string) =>
    request<{ message: string; quota: PrintQuota }>(`/print/admin/access/${userId}/grant`, {
      method: 'POST',
      token,
      body: JSON.stringify({ seconds, reason })
    }),

  setPrinter: (
    token: string | null,
    patch: Partial<{
      name: string
      host: string
      printerApiKey: string
      autoStart: boolean
      acceptedFilaments: string
      state: 'idle' | 'disabled'
      defaultWindowSeconds: number
      maxJobSeconds: number
      maxQueuedJobs: number
      quietStartHour: number | null
      quietEndHour: number | null
      notes: string
    }>
  ) =>
    request<{ message: string }>('/print/admin/printer', {
      method: 'PUT',
      token,
      body: JSON.stringify(patch)
    }),

  refund: (token: string | null, jobId: string, reason: string, seconds?: number) =>
    request<{ message: string }>(`/print/admin/jobs/${jobId}/refund`, {
      method: 'POST',
      token,
      body: JSON.stringify({ reason, seconds })
    }),

  forceIdle: (token: string | null) =>
    request<{ message: string; releasedJobId: string | null }>('/print/admin/force-idle', {
      method: 'POST',
      token,
      body: '{}'
    }),

  storage: (token: string | null) =>
    request<{ files: number; bytes: number; budgetBytes: number; retentionDays: number }>(
      '/print/admin/storage',
      { token }
    )
}

/** "4h37", "25 min", "1h" — mesmo formato que o servidor usa nas mensagens. */
export function formatSeconds(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  const minutes = Math.round(total / 60)
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}
