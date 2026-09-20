/**
 * QUAL ANEXO TOCA E QUAL SO BAIXA
 *
 * Video viaja nos MESMOS campos do anexo generico da mensagem
 * (`fileUrl`/`fileName`/`fileSize`/`fileMime`) — nao ha coluna nova no banco.
 * O que separa um `.mp4` de um modpack e o que esta aqui: o MIME que o
 * servidor gravou, com a extensao como rede de seguranca.
 *
 * Mora fora do `api.ts` porque quem pergunta sao dois lados que nao se
 * conversam: o compositor (pra escolher a ROTA de upload, antes de subir) e a
 * mensagem na conversa (pra escolher entre <video> e cartao de download).
 */

/**
 * O que o Chromium toca sem plugin — a mesma lista da rota `/uploads/video`
 * no servidor (routes/uploads.routes.ts).
 *
 * `.mkv` e `.avi` ficam DE FORA de proposito: o Chromium nao toca, e um
 * player preto e pior que um cartao de download. Esses continuam indo pela
 * rota de arquivo generico, como sempre foi.
 */
const PLAYABLE_VIDEO_EXT = ['.mp4', '.m4v', '.webm', '.mov', '.ogv']

const PLAYABLE_VIDEO_MIME = [
  'video/mp4',
  'video/x-m4v',
  'video/webm',
  'video/quicktime',
  'video/ogg'
]

/**
 * Teto da rota de VIDEO no servidor (`VIDEO_LIMIT` em uploads.routes.ts).
 *
 * Espelhado aqui pra recusar ANTES de subir: sem isso a pessoa espera a barra
 * chegar em 100% pra receber "arquivo muito grande" — em 100 MB isso e um
 * minuto de internet de casa jogado fora.
 */
export const MAX_VIDEO_BYTES = 100_000_000

/** Teto da rota de ARQUIVO (`FILE_LIMIT` em uploads.routes.ts). */
export const MAX_FILE_BYTES = 50_000_000

/**
 * Este anexo e um video que da pra tocar na conversa?
 *
 * Olha o MIME primeiro e cai na extensao depois: o MIME vem do sistema
 * operacional na hora de escolher o arquivo (no Windows sai do registro e as
 * vezes vem vazio), e mensagem antiga pode ter sido gravada com
 * `application/octet-stream` antes desta tela existir.
 */
export function isPlayableVideo(attachment: {
  mime?: string | null
  name?: string | null
  url?: string | null
}): boolean {
  const mime = (attachment.mime ?? '').toLowerCase().split(';')[0].trim()
  if (PLAYABLE_VIDEO_MIME.includes(mime)) return true
  // Um `video/*` fora da lista (mkv, avi) NAO toca — nao e "qualquer video".
  if (mime.startsWith('video/')) return false

  const source = (attachment.name || attachment.url || '').toLowerCase()
  // Sem o corte na query string, uma URL com `?v=2` esconderia a extensao.
  const clean = source.split('?')[0].split('#')[0]
  return PLAYABLE_VIDEO_EXT.some((ext) => clean.endsWith(ext))
}

/** O mesmo, pro arquivo que a pessoa acabou de escolher (ainda nao subiu). */
export function isPlayableVideoFile(file: File): boolean {
  return isPlayableVideo({ mime: file.type, name: file.name })
}

export function formatBytes(bytes: number): string {
  if (!bytes) return 'arquivo'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
