import * as React from 'react'
import { Loader2, Settings, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Lang } from '@/lib/api-lingua'
import { LANG_NAME, VOICE_PACK_NAME } from '@/lib/lingua-ui'
import { isWeb } from '@/lib/platform'
import { Flag } from './Flag'

type Step = 'ask' | 'installing' | 'restart' | 'manual'

/**
 * Língua sem voz no sistema: oferece instalar pelo launcher (UAC). Falhou ou
 * é a versão web → passo a passo do Windows. Sempre dá pra seguir sem som
 * (só pelo botão: fechar o diálogo não começa a lição).
 */
export function VoiceSetup({
  lang,
  onContinue,
  onCancel
}: {
  lang: Lang
  /** "Continuar sem som": segue pra lição (começa o dia). */
  onContinue: () => void
  /** Fechou o diálogo (Esc, fora, X): volta pra lista sem mandar nada pro servidor. */
  onCancel: () => void
}) {
  const [step, setStep] = React.useState<Step>(isWeb() ? 'manual' : 'ask')
  const [error, setError] = React.useState<string | null>(null)

  const install = async () => {
    setStep('installing')
    setError(null)
    try {
      const res = await window.bocas.lingua.installVoice(lang)
      if (res.ok) {
        setStep('restart')
        return
      }
      if (res.error && res.error !== 'web') setError(res.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setStep('manual')
  }

  return (
    <Dialog open onOpenChange={(open) => !open && step !== 'installing' && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag lang={lang} size={18} /> Sem voz de {LANG_NAME[lang].toLowerCase()}
          </DialogTitle>
          <DialogDescription>
            Pra ouvir a pronúncia, o Windows precisa da voz {VOICE_PACK_NAME[lang]}. É grátis.
          </DialogDescription>
        </DialogHeader>

        {step === 'installing' && (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Instalando… aceite o aviso do Windows. Pode levar uns minutos.
          </p>
        )}

        {step === 'restart' && (
          <p className="mt-4 rounded-brutal border border-acid/40 bg-acid/10 px-3 py-2 text-sm text-acid">
            Voz instalada. Reinicie o launcher para ativar a voz.
          </p>
        )}

        {step === 'manual' && (
          <div className="mt-4 space-y-3 text-sm">
            {error && <p className="text-destructive">Não deu pra instalar daqui ({error}).</p>}
            <ol className="list-decimal space-y-1 pl-5 text-foreground">
              <li>Abra Configurações &gt; Hora e idioma &gt; Fala.</li>
              <li>Em "Gerenciar vozes", clique em "Adicionar vozes".</li>
              <li>Procure {VOICE_PACK_NAME[lang]} e instale.</li>
              <li>{isWeb() ? 'Feche e abra o navegador.' : 'Reinicie o launcher.'}</li>
            </ol>
          </div>
        )}

        <DialogFooter className="mt-5">
          <Button variant="ghost" onClick={onContinue} disabled={step === 'installing'}>
            <VolumeX className="mr-1.5 h-4 w-4" aria-hidden />
            Continuar sem som
          </Button>
          {step === 'ask' && <Button onClick={() => void install()}>Instalar voz</Button>}
          {step === 'manual' && !isWeb() && (
            <Button variant="secondary" onClick={() => void window.bocas.lingua.openSpeechSettings()}>
              <Settings className="mr-1.5 h-4 w-4" aria-hidden />
              Abrir configurações de fala
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
