import us from '@/assets/flags/us.svg'
import jp from '@/assets/flags/jp.svg'
import fr from '@/assets/flags/fr.svg'
import it from '@/assets/flags/it.svg'
import es from '@/assets/flags/es.svg'
import de from '@/assets/flags/de.svg'
import cn from '@/assets/flags/cn.svg'
import type { Lang } from '@/lib/api-lingua'
import { LANG_NAME } from '@/lib/lingua-ui'
import { cn as cx } from '@/lib/utils'

/**
 * Bandeirinha da língua. SVG e não emoji: o Windows não desenha bandeira em
 * emoji (sai "JP" em letras). Inglês usa a dos EUA (a voz é en-US).
 */
const FLAGS: Record<Lang, string> = { en: us, ja: jp, fr, it, es, de, zh: cn }

export function Flag({ lang, size = 20, className }: { lang: Lang; size?: number; className?: string }) {
  return (
    <img
      src={FLAGS[lang]}
      alt={LANG_NAME[lang]}
      title={LANG_NAME[lang]}
      width={Math.round(size * 1.5)}
      height={size}
      draggable={false}
      className={cx('inline-block shrink-0 rounded-[2px] border border-line/60 object-cover', className)}
    />
  )
}
