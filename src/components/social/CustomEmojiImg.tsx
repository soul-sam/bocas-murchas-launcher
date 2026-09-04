import { cn } from '@/lib/utils'
import { resolveAssetUrl } from '@/lib/api'
import { useEmojis, type CustomEmoji } from '@/lib/emoji-context'

/**
 * A imagem de um emoji customizado, no tamanho de uma letra.
 *
 * `align-text-bottom` + altura fixa: e o que faz o emoji sentar na linha do
 * texto em vez de empurrar a linha pra baixo. `object-contain` porque nem todo
 * mundo sobe imagem quadrada.
 */
export function EmojiImage({
  emoji,
  jumbo,
  className
}: {
  emoji: CustomEmoji
  /** Mensagem so de emoji: cresce igual o emoji unicode cresce. */
  jumbo?: boolean
  className?: string
}) {
  const label = ':' + emoji.name + ':'

  return (
    <img
      src={resolveAssetUrl(emoji.url)}
      alt={label}
      title={label}
      loading="lazy"
      draggable={false}
      className={cn(
        'inline-block object-contain align-text-bottom',
        jumbo ? 'h-12 w-12' : 'h-5 w-5',
        className
      )}
    />
  )
}

/**
 * Versao por NOME, que e o que o parser entrega.
 *
 * O parser (lib/rich-text.ts) transforma qualquer `:algo:` em no de emoji sem
 * saber se "algo" existe — ele e puro e nao tem acesso a lista. Quem decide e
 * este componente: nome desconhecido volta a ser o texto literal `:algo:`,
 * senao "reuniao as 10:30:45" perderia pedacos.
 */
export function CustomEmojiImg({
  name,
  jumbo,
  className
}: {
  name: string
  jumbo?: boolean
  className?: string
}) {
  const { byName } = useEmojis()
  const emoji = byName.get(name)

  if (!emoji) return <>{':' + name + ':'}</>

  return <EmojiImage emoji={emoji} jumbo={jumbo} className={className} />
}
