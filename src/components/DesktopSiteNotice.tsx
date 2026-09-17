import * as React from 'react'
import { Smartphone, X } from 'lucide-react'
import { isWeb } from '@/lib/platform'

/**
 * "SITE PARA COMPUTADOR" LIGADO — o aviso que evita o chamado.
 *
 * O Chrome do Android (e o Safari do iPhone) tem um "Site para computador" que
 * fica ligado **por origem** e **gruda entre visitas**. Com ele ligado o
 * navegador IGNORA `width=device-width` e finge uma janela de ~980px: o app
 * monta na densidade de desktop e a pessoa vê tudo minúsculo, com zoom
 * disponível. Parece bug do site; não é, e não há nada que a página possa
 * fazer pra desligar sozinha.
 *
 * Isso morde mais aqui do que morderia em outro lugar: o SITE ANTIGO vivia
 * nesta mesma origem, então quem marcou a caixinha lá em algum momento
 * continua marcado hoje, sem lembrar.
 *
 * Detecção: ponteiro grosso (dedo) + toque disponível + uma janela larga
 * demais pra caber num aparelho de dedo. Um desktop com tela sensível ao
 * toque casaria também — por isso o aviso é dispensável e não bloqueia nada.
 */
export function DesktopSiteNotice() {
  const [dispensado, setDispensado] = React.useState(false)
  const [suspeito, setSuspeito] = React.useState(false)

  React.useEffect(() => {
    if (!isWeb()) return

    const avaliar = (): void => {
      const dedo = window.matchMedia('(pointer: coarse)').matches
      const temToque = navigator.maxTouchPoints > 0
      // 900 é o mesmo corte do layout-context: acima disso ele monta a
      // versão de desktop. É exatamente a linha que a pessoa cruzou sem
      // querer.
      const larguraDeDesktop = window.innerWidth >= 900
      setSuspeito(dedo && temToque && larguraDeDesktop)
    }

    avaliar()
    window.addEventListener('resize', avaliar)
    window.addEventListener('orientationchange', avaliar)
    return () => {
      window.removeEventListener('resize', avaliar)
      window.removeEventListener('orientationchange', avaliar)
    }
  }, [])

  if (!suspeito || dispensado) return null

  // Safari e Chrome escondem isso em lugares diferentes, e mandar a pessoa
  // pro menu errado é pior que não avisar.
  const noIPhone = /iP(hone|ad|od)/.test(navigator.userAgent)

  return (
    <div className="flex shrink-0 items-start gap-2 border-b border-burn/40 bg-burn/10 px-3 py-2 text-xs leading-snug text-foreground">
      <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-burn" />
      <p className="min-w-0 flex-1">
        <span className="font-medium">Seu navegador está no modo "site para computador"</span> — por
        isso está tudo pequeno.{' '}
        {noIPhone ? (
          <>
            Toque em <span className="font-medium">ᴀA</span> na barra de endereço e escolha{' '}
            <span className="font-medium">Solicitar site para celular</span>.
          </>
        ) : (
          <>
            Abra o menu <span className="font-medium">⋮</span> e desmarque{' '}
            <span className="font-medium">Site para computador</span>.
          </>
        )}
      </p>
      <button
        type="button"
        aria-label="Dispensar aviso"
        onClick={() => setDispensado(true)}
        className="shrink-0 rounded-brutal p-0.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
