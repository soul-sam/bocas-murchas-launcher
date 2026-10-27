import { useNavigate } from 'react-router-dom'
import { MonitorPlay } from 'lucide-react'
import { UserAvatar } from '@/components/ui/avatar'
import { Escudo, FutebolIcon } from '@/components/futebol/FutebolGlyphs'
import { pontosTom } from '@/components/futebol/JogoLinha'
import { resolveAssetUrl } from '@/lib/api'
import { PONTOS, TIPO_FONTE, type FutebolCardMeta } from '@/lib/api-futebol'
import { useFutebolOpcional } from '@/lib/futebol-context'
import { useMembers } from '@/lib/members-context'
import { cn } from '@/lib/utils'
import { CardFrame, type CardProps } from './index'

/**
 * Dois cards com a mesma cara de placar:
 *  - FIM DE JOGO com os palpites da galera (modules/futebol.ts na API posta no
 *    feed de jogos quando um jogo palpitado termina). Quem cravou fica em
 *    cima, aceso;
 *  - CONVITE "vem assistir" (POST /futebol/chamar): o botão abre o player no
 *    mesmo jogo, na mesma transmissão de quem chamou.
 */
export function FutebolCard({ metadata }: CardProps<FutebolCardMeta>) {
  const jogo = metadata?.jogo
  if (!jogo?.casa || !jogo?.fora) return null
  if (metadata.kind === 'convite') return <Convite metadata={metadata} />
  return <Resultado metadata={metadata} />
}

function Placar({ jogo }: { jogo: FutebolCardMeta['jogo'] }) {
  const temPlacar = jogo.estado !== 'pre' && jogo.casa.gols !== null
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1">
      <div className="flex min-w-0 items-center justify-end gap-2">
        <span className="truncate text-sm text-foreground">{jogo.casa.curto}</span>
        <Escudo src={jogo.casa.escudo} sigla={jogo.casa.sigla} cor={jogo.casa.cor} className="h-7 w-7" />
      </div>
      <span className="font-display text-2xl leading-none tabular-nums text-foreground">
        {temPlacar ? (
          <>
            {jogo.casa.gols ?? 0} <span className="text-muted-foreground">x</span> {jogo.fora.gols ?? 0}
          </>
        ) : (
          <span className="text-muted-foreground">x</span>
        )}
      </span>
      <div className="flex min-w-0 items-center gap-2">
        <Escudo src={jogo.fora.escudo} sigla={jogo.fora.sigla} cor={jogo.fora.cor} className="h-7 w-7" />
        <span className="truncate text-sm text-foreground">{jogo.fora.curto}</span>
      </div>
    </div>
  )
}

function Convite({ metadata }: { metadata: Extract<FutebolCardMeta, { kind: 'convite' }> }) {
  const navigate = useNavigate()
  const ctx = useFutebolOpcional()
  const { jogo, fonte } = metadata
  // O placar do card é a foto da hora do convite; ao vivo, o do socket.
  const agora = ctx?.aoVivo.find((j) => j.id === jogo.id) ?? jogo
  const quantos = ctx?.assistindo[jogo.id]?.length ?? 0

  return (
    <CardFrame
      icon={<MonitorPlay className="h-3.5 w-3.5" />}
      title={[jogo.ligaNome, fonte ? `${TIPO_FONTE[fonte.tipo]}${fonte.canal ? ` na ${fonte.canal}` : ''}` : null]
        .filter(Boolean)
        .join(' · ')}
      footer={
        <button type="button" onClick={() => navigate('/futebol')} className="hover:text-acid">
          {quantos > 0 ? `${quantos} assistindo agora · abrir o futebol` : 'abrir o futebol'}
        </button>
      }
    >
      <Placar jogo={agora} />
      {ctx && (
        <button
          type="button"
          onClick={() => ctx.assistir(agora, fonte)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-brutal border border-acid-dark py-1.5 text-sm text-acid transition-colors hover:bg-acid/15"
        >
          <MonitorPlay className="h-4 w-4" aria-hidden /> Assistir junto
        </button>
      )}
    </CardFrame>
  )
}

function Resultado({ metadata }: { metadata: Extract<FutebolCardMeta, { kind: 'resultado' }> }) {
  const navigate = useNavigate()
  const { byId } = useMembers()
  const jogo = metadata.jogo
  const palpites = Array.isArray(metadata.palpites) ? metadata.palpites : []
  const cravaram = palpites.filter((p) => p.pontos >= PONTOS.exato).length

  return (
    <CardFrame
      icon={<FutebolIcon className="h-3.5 w-3.5" />}
      title={[jogo.ligaNome, jogo.fase].filter(Boolean).join(' · ') || 'Fim de jogo'}
      footer={
        <button type="button" onClick={() => navigate('/futebol')} className="hover:text-acid">
          {cravaram > 0
            ? `${cravaram} ${cravaram === 1 ? 'cravou' : 'cravaram'} o placar · abrir o bolão`
            : 'Ninguém cravou · abrir o bolão'}
        </button>
      }
    >
      <Placar jogo={jogo} />

      {palpites.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
          {palpites.slice(0, 8).map((p) => {
            const m = byId[p.userId]
            return (
              <li key={p.userId} className="flex items-center gap-2">
                <UserAvatar
                  userId={p.userId}
                  src={resolveAssetUrl(m?.avatar)}
                  name={m?.displayName ?? '?'}
                  ringColor={m?.profileColor ?? undefined}
                  className="h-5 w-5"
                />
                <span className="min-w-0 flex-1 truncate text-xs text-dirty-white">{m?.displayName ?? 'Alguém'}</span>
                <span className="font-mono text-xs text-foreground">
                  {p.home} x {p.away}
                </span>
                <span
                  className={cn(
                    'w-10 rounded-brutal border px-1 text-center font-mono text-[11px]',
                    pontosTom(p.pontos)
                  )}
                >
                  +{p.pontos}
                </span>
              </li>
            )
          })}
          {palpites.length > 8 && (
            <li className="text-[11.5px] text-muted-foreground">e mais {palpites.length - 8}</li>
          )}
        </ul>
      )}
    </CardFrame>
  )
}
