import * as React from 'react'
import { Label } from '@/components/ui/label'
import { useFutebolOpcional } from '@/lib/futebol-context'
import { Escudo } from './FutebolGlyphs'
import { SeletorDeTime } from './MeuTimeAba'

/**
 * O "time do coração" dentro do editor de perfil. Não entra no formulário do
 * editor: é da tela de futebol e salva na hora em que a pessoa escolhe — o
 * mesmo dado, de dois lugares.
 */
export function TimeDoCoracao() {
  const futebol = useFutebolOpcional()
  const [escolhendo, setEscolhendo] = React.useState(false)
  if (!futebol) return null
  const { meuTime } = futebol

  return (
    <div className="space-y-1.5">
      <Label>Time do coração</Label>
      {escolhendo ? (
        <SeletorDeTime onEscolhido={() => setEscolhendo(false)} onCancelar={() => setEscolhendo(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setEscolhendo(true)}
          className="flex w-full items-center gap-2.5 rounded-brutal border border-line bg-void/60 px-3 py-2 text-left text-sm transition-colors hover:border-acid/60"
        >
          {meuTime ? (
            <>
              <Escudo src={meuTime.teamLogo} sigla={meuTime.teamAbbr} cor={meuTime.teamColor} className="h-6 w-6" />
              <span className="flex-1 text-foreground">{meuTime.teamName}</span>
              <span className="text-xs text-muted-foreground">trocar</span>
            </>
          ) : (
            <span className="flex-1 text-muted-foreground">Escolher (aparece no perfil e avisa os gols)</span>
          )}
        </button>
      )}
    </div>
  )
}
