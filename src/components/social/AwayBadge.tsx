import { Coffee } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AFK_AUTO_NOTE } from '@/lib/afk-context'
import { CustomEmojiImg } from './CustomEmojiImg'

/**
 * AUSÊNCIA É CRACHÁ, RECADO É DO DONO.
 *
 * Estas duas coisas moravam no mesmo lugar: o AFK gravava "Longe do teclado"
 * no `customStatus` da pessoa, por cima do que ela tinha escrito — e quem
 * fechasse o launcher ausente perdia o próprio recado pra sempre. Agora a
 * ausência é desenhada a partir do STATUS (que o servidor já manda pra todo
 * mundo) e o recado é um campo que só o dono escreve. Ver lib/afk-context.
 *
 * Por isso os dois componentes vivem no mesmo arquivo: a regra que importa é a
 * de que eles são independentes, e ela some se ficarem em pastas diferentes.
 */

/**
 * O crachá de "não está na cadeira".
 *
 * Some sozinho quando o status deixa de ser `away` — não há texto pendurado em
 * lugar nenhum pra limpar depois.
 */
export function AwayBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-brutal border border-burn/40',
        'bg-burn/10 px-1.5 py-px font-mono text-[11px] uppercase tracking-wide text-burn/90',
        className
      )}
      title={AFK_AUTO_NOTE}
    >
      <Coffee className="h-2.5 w-2.5 shrink-0" />
      ausente
    </span>
  )
}

/** `:nome:` dos emojis do servidor. O mesmo que o chat entende. */
const CUSTOM_EMOJI = /:([a-z0-9_+-]{2,32}):/gi

/**
 * O recado da pessoa, com os emojis do servidor desenhados.
 *
 * Emoji unicode já sai de graça (é texto); o que precisa de tradução é o
 * `:kekw:` do servidor, que aqui aparecia cru. Nome desconhecido volta a ser o
 * texto literal — mesma regra do CustomEmojiImg, pra não comer pedaço de
 * "reunião às 10:30:45".
 */
export function StatusText({ text, className }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = []
  let last = 0

  CUSTOM_EMOJI.lastIndex = 0
  for (let match = CUSTOM_EMOJI.exec(text); match; match = CUSTOM_EMOJI.exec(text)) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push(
      <CustomEmojiImg key={`${match.index}-${match[1]}`} name={match[1]} className="h-3.5 w-3.5" />
    )
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))

  return <span className={className}>{parts}</span>
}
