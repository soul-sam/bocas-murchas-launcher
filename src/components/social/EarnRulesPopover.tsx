import * as React from 'react'
import {
  CalendarCheck,
  Coins,
  Dices,
  Gamepad2,
  HelpCircle,
  Loader2,
  Mic,
  Target,
  TrendingUp
} from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { gamification, type EarnRules } from '@/lib/api-gamification'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'

/**
 * "?" do saldo da lojinha — de onde vem murcho.
 *
 * Os números vêm do servidor (`GET /gamification/earn-rules`, que lê
 * rules.ts) em vez de estarem escritos aqui: o balanceamento já mudou duas
 * vezes e uma tabela copiada no cliente mentiria na mudança seguinte.
 *
 * Popover NÃO modal, igual ao BetPopover: ele abre de dentro da lojinha, que
 * já é uma camada própria, e camada modal aninhada trava o <body> — ver
 * lib/interaction-guard.ts.
 *
 * Busca só na primeira abertura. Preço de balanceamento não muda no meio do
 * uso, e refazer a chamada a cada clique piscaria a lista.
 */
export function EarnRulesPopover({ className }: { className?: string }) {
  const { token } = useAuth()
  const [open, setOpen] = React.useState(false)
  const [rules, setRules] = React.useState<EarnRules | null>(null)
  const [error, setError] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  const load = React.useCallback(async (): Promise<void> => {
    if (!token) return
    setLoading(true)
    setError(false)
    try {
      setRules(await gamification.earnRules(token))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [token])

  React.useEffect(() => {
    if (open && !rules && !loading) void load()
  }, [open, rules, loading, load])

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Como ganhar murchos"
          title="Como ganhar murchos"
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
            'text-muted-foreground transition-colors hover:text-burn',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-burn',
            className
          )}
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </PopoverTrigger>

      <PopoverContent side="bottom" align="end" className="w-[19rem] p-0">
        <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <Coins className="h-4 w-4 shrink-0 text-burn" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm leading-tight text-foreground">
              De onde vem murcho
            </p>
            <p className="text-[11px] leading-tight text-muted-foreground">
              você joga e conversa, o saldo sobe sozinho
            </p>
          </div>
        </header>

        {loading && (
          <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            carregando
          </div>
        )}

        {error && !loading && (
          <div className="px-3 py-5 text-center">
            <p className="mb-2 text-xs text-muted-foreground">Não deu pra carregar a tabela.</p>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-brutal border border-line px-2 py-1 text-[11px] text-foreground hover:border-burn/60 hover:text-burn"
            >
              Tentar de novo
            </button>
          </div>
        )}

        {rules && !loading && !error && <RulesList rules={rules} />}
      </PopoverContent>
    </Popover>
  )
}

function RulesList({ rules }: { rules: EarnRules }) {
  const { actions, levelUp, wager } = rules

  return (
    <div className="max-h-[22rem] overflow-y-auto px-3 py-2.5">
      {/* Só "Todo dia" mostra número. Ali o valor é sempre o mesmo e a pessoa
          consegue planejar o dia com ele. No resto depende do jogo, do
          resultado e do nível — número solto ali viraria promessa quebrada. */}
      <Section title="Todo dia">
        <Row Icon={CalendarCheck} label="Check-in" value={`+${actions.checkinBase}`}>
          mais {actions.checkinPerStreak} por dia de sequência, até {actions.checkinStreakMax}
        </Row>
        <Row Icon={Mic} label="Meia hora em call" value={`+${actions.voicePer30Min}`} />
        <Row Icon={Target} label="Missão concluída" value={`+${actions.missionComplete}`} />
      </Section>

      <Section title="Jogando">
        <Row Icon={Gamepad2} label="League of Legends">
          toda partida paga, vitória paga mais
        </Row>
        <Row Icon={ChessGlyph} label="Xadrez">
          quanto mais longo o controle de tempo, mais paga; vitória dobra
        </Row>
        <Row Icon={Dices} label="Apostando">
          quem acerta leva o dobro do que apostou; só nos {Math.round(wager.betWindowMs / 60000)}{' '}
          primeiros minutos da partida, uma aposta por partida
        </Row>
        <Row Icon={Dices} label="Seu teto de aposta" value={`${wager.myMax}`}>
          começa em {wager.startMax} e sobe a cada aposta até {wager.max}, na{' '}
          {wager.rampBets}ª
        </Row>
      </Section>

      <Section title="De vez em quando">
        <Row Icon={TrendingUp} label={`Subir pro nível ${levelUp.next.level}`} highlight>
          cada nível paga mais que o anterior
        </Row>
        <Row Icon={Coins} label="Prêmio do recap">
          pra quem se destaca na semana
        </Row>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-2.5 last:mb-0">
      <h3 className="mb-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  )
}

/** Aceita ícone do lucide e o peão desenhado aqui embaixo. */
type RowIcon = React.ComponentType<{ className?: string }>

function Row({
  Icon,
  label,
  value,
  highlight,
  children
}: {
  Icon: RowIcon
  label: string
  /** Sem valor, a linha só descreve — é assim fora de "Todo dia". */
  value?: string
  /** Destaca a linha que muda por pessoa (o próximo nível). */
  highlight?: boolean
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-brutal px-1.5 py-1',
        highlight && 'border border-burn/30 bg-burn/[0.06]'
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-tight text-foreground">{label}</p>
        {children && (
          <p className="text-[11px] leading-tight text-muted-foreground">{children}</p>
        )}
      </div>
      {value && <span className="shrink-0 font-mono text-xs text-burn">{value}</span>}
    </div>
  )
}

/** Peão de xadrez: o lucide não tem um, e o ♟ já é o glifo usado nas badges. */
function ChessGlyph({ className }: { className?: string }): React.ReactElement {
  return (
    <span aria-hidden className={cn('text-center text-[13px] leading-none', className)}>
      ♟
    </span>
  )
}
