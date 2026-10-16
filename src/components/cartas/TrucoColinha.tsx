import * as React from 'react'
import { BookOpen, ListOrdered, Scale, TrendingUp } from 'lucide-react'
import type { TrucoVariant, TrucoView } from '@/lib/api-cartas'
import type { IconComponent } from '@/lib/icon-component'
import { cn } from '@/lib/utils'
import { CardRow, PlayingCard } from '@/components/poker/PlayingCard'

/**
 * A COLINHA DO TRUCO — o que se esquece no meio da mão: a ordem das cartas,
 * as manilhas (da mão de AGORA, no paulista), quanto vale cada grito e as
 * mãos especiais. Mesmo desenho da colinha do pôquer (abas + seções), na
 * mesma gaveta do lado da mesa.
 */

type Tab = 'cartas' | 'gritos' | 'como' | 'empates'

const TABS: Array<{ id: Tab; label: string; Icon: IconComponent }> = [
  { id: 'cartas', label: 'Cartas', Icon: ListOrdered },
  { id: 'gritos', label: 'Gritos', Icon: TrendingUp },
  { id: 'como', label: 'Como joga', Icon: BookOpen },
  { id: 'empates', label: 'Empates', Icon: Scale }
]

/** Fraca → forte, as comuns. Mesmo em código de carta ("4c"), só pelo valor. */
const ORDER = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3']
const MINEIRO_MANILHAS = ['4c', '7h', 'As', '7d']
const MANILHA_NAME: Record<string, string> = { c: 'zap (paus)', h: 'copas', s: 'espadilha (espadas)', d: 'pica-fumo (ouros)' }

const LADDER: Record<TrucoVariant, Array<{ name: string; value: number }>> = {
  paulista: [
    { name: 'Mão', value: 1 },
    { name: 'Truco', value: 3 },
    { name: 'Seis', value: 6 },
    { name: 'Nove', value: 9 },
    { name: 'Doze', value: 12 }
  ],
  mineiro: [
    { name: 'Mão', value: 2 },
    { name: 'Truco', value: 4 },
    { name: 'Seis', value: 6 },
    { name: 'Nove', value: 10 },
    { name: 'Doze', value: 12 }
  ]
}

export function TrucoColinha({ variant, view }: { variant: TrucoVariant; view: TrucoView | null }) {
  const [tab, setTab] = React.useState<Tab>('cartas')
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label="Regras do truco" className="flex shrink-0 flex-wrap gap-1 border-b border-line pb-2">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 rounded-brutal border px-2.5 py-1.5 text-xs transition-colors',
              tab === id ? 'border-acid/60 bg-acid/10 text-acid' : 'border-transparent text-muted-foreground hover:bg-void-light hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <div className="scroll-stable min-h-0 flex-1 overflow-y-auto pt-3">
        {tab === 'cartas' && <Cartas variant={variant} view={view} />}
        {tab === 'gritos' && <Gritos variant={variant} />}
        {tab === 'como' && <Como variant={variant} />}
        {tab === 'empates' && <Empates />}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-brutal border border-line bg-void/60 px-3 py-2.5">
      <h4 className="mb-1.5 text-sm font-semibold text-foreground">{title}</h4>
      <div className="space-y-1.5 text-xs leading-snug text-muted-foreground">{children}</div>
    </section>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return <span className="text-foreground">{children}</span>
}

function Cartas({ variant, view }: { variant: TrucoVariant; view: TrucoView | null }) {
  const manilhas = variant === 'mineiro' ? MINEIRO_MANILHAS : view?.manilhas ?? []
  return (
    <div className="space-y-2">
      <Section title="As manilhas (as mais fortes)">
        {variant === 'mineiro' ? (
          <p>
            No mineiro elas são <Key>fixas</Key>, da mais forte pra mais fraca: <Key>4 de paus</Key> (zap),{' '}
            <Key>7 de copas</Key>, <Key>ás de espadas</Key> (espadilha) e <Key>7 de ouros</Key> (pica-fumo). Elas não contam
            como cartas comuns.
          </p>
        ) : (
          <p>
            No paulista vira-se uma carta depois de dar (a <Key>vira</Key>). As manilhas são o valor <Key>logo acima</Key> dela
            na ordem abaixo (vira 7 → manilha Q; vira 3 → manilha 4). Entre as quatro, quem manda é o naipe: <Key>paus</Key>{' '}
            (zap) &gt; <Key>copas</Key> &gt; <Key>espadas</Key> &gt; <Key>ouros</Key>.
          </p>
        )}
        {manilhas.length > 0 && (
          <div className="space-y-1">
            {variant === 'paulista' && view?.vira && (
              <p className="flex items-center gap-2">
                Nesta mão a vira é <PlayingCard code={view.vira} size="xs" /> — manilhas:
              </p>
            )}
            <div className="flex flex-wrap items-end gap-2 pt-1">
              {manilhas.map((code, i) => (
                <span key={code} className="flex flex-col items-center gap-1">
                  <PlayingCard code={code} size="sm" highlight={i === 0} />
                  <span className="text-[11px]">{MANILHA_NAME[code[1]]?.split(' ')[0]}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        {variant === 'paulista' && manilhas.length === 0 && <p>As manilhas desta mão aparecem aqui quando a vira abrir.</p>}
      </Section>
      <Section title="As comuns, da mais fraca pra mais forte">
        <div className="flex flex-wrap items-end gap-1 pt-1">
          {ORDER.map((r) => (
            <PlayingCard key={r} code={`${r}${r === 'Q' || r === 'K' || r === '2' ? 'h' : r === 'A' || r === '3' ? 's' : 'd'}`} size="xs" />
          ))}
        </div>
        <p>
          4 · 5 · 6 · 7 · <Key>Q · J · K</Key> · A · 2 · <Key>3</Key>. Sem 8, 9 e 10. O valete ganha da dama. Comum do mesmo
          valor <Key>empata</Key> — naipe só desempata manilha.
        </p>
      </Section>
    </div>
  )
}

function Gritos({ variant }: { variant: TrucoVariant }) {
  const ladder = LADDER[variant]
  const onze = variant === 'paulista' ? { at: 11, play: 3, run: 1, name: 'mão de onze' } : { at: 10, play: 4, run: 2, name: 'mão de dez' }
  return (
    <div className="space-y-2">
      <Section title={`Quanto vale (${variant})`}>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {ladder.map((step, i) => (
            <React.Fragment key={step.name}>
              {i > 0 && <span aria-hidden>→</span>}
              <span className="rounded-full border border-line-strong bg-void px-2 py-0.5 text-[11.5px]">
                <span className="text-foreground">{step.name}</span> <span className="font-mono text-burn">{step.value}</span>
              </span>
            </React.Fragment>
          ))}
        </div>
        <p>
          Quem está <Key>na vez</Key> pode gritar antes de jogar a carta. O outro lado responde: <Key>aceitar</Key> (a mão passa a
          valer o grito), <Key>correr</Key> (quem gritou leva o que valia antes) ou <Key>subir</Key> pro próximo degrau — aí é a
          vez de quem gritou responder.
        </p>
        <p>Quem subiu por último não sobe de novo: agora só o outro lado pode pedir mais. Não dá pra pular degrau.</p>
      </Section>
      <Section title="Correr é da dupla (2x2)">
        <p>
          Um parceiro sozinho não entrega a mão: apertar <Key>correr</Key> é só um voto. A mão corre quando os{' '}
          <Key>dois</Key> votam. Até lá o outro decide: <Key>corre junto</Key> ou <Key>vai sozinho</Key> — aceitar ou subir vale
          pela dupla inteira. Na mão de {onze.at === 11 ? 'onze' : 'dez'} é igual: correr precisa dos dois, jogar basta um.
        </p>
      </Section>
      <Section title={onze.name[0].toUpperCase() + onze.name.slice(1)}>
        <p>
          Quando uma dupla chega a <Key>{onze.at}</Key>, ela olha as próprias cartas (e as do parceiro, no 2x2) antes de decidir:{' '}
          <Key>jogar</Key> (a mão vale {onze.play}) ou <Key>correr</Key> (o outro lado ganha {onze.run}). Ninguém grita truco
          nessa mão.
        </p>
      </Section>
      <Section title="Mão de ferro">
        <p>
          As duas duplas em {onze.at}: <Key>ninguém vê as próprias cartas</Key>. Joga-se no escuro, pela posição, sem truco e sem
          carta coberta. Quem levar, fecha.
        </p>
      </Section>
    </div>
  )
}

function Como({ variant }: { variant: TrucoVariant }) {
  return (
    <div className="space-y-2">
      <Section title="O objetivo">
        <p>
          Fazer <Key>12 tentos</Key> antes do outro lado. Cada mão vale {variant === 'paulista' ? '1' : '2'} — até alguém gritar.
        </p>
      </Section>
      <Section title="A mão">
        <p>
          Três cartas pra cada. São até <Key>três vazas</Key>: cada um joga uma carta, a maior leva. Quem faz <Key>duas</Key>{' '}
          leva a mão. Quem ganha a vaza começa a próxima. O jogo anda pra <Key>direita</Key>.
        </p>
        <p>No 2x2 quem senta em frente é o parceiro, e as duplas jogam alternadas.</p>
      </Section>
      <Section title="Carta coberta">
        <p>
          Da <Key>segunda vaza</Key> em diante dá pra jogar uma carta virada pra baixo (clique direito, ou o botão "coberta"). Ela
          não ganha de nada — serve pra esconder o que você tem.
        </p>
      </Section>
      <Section title="Sinais">
        <p>
          O botão <Key>Sinais</Key> no rodapé (ou a tecla <Key>S</Key>) tem os gestos de sempre: piscar é zap, sobrancelha é copas,
          boca torta é espadilha, língua é pica-fumo, e por aí vai. Dá pra emendar vários seguidos. Como na mesa de verdade, a{' '}
          <Key>mesa inteira vê</Key> — o parceiro e os adversários.
        </p>
      </Section>
      <Section title="Fim da mão">
        <p>Carta que não foi jogada não aparece pra ninguém, nem no fim: o blefe da próxima mão continua valendo.</p>
      </Section>
      <Section title="Relógio">
        <p>Dormiu na vez, o relógio joga a carta mais fraca por você; dormiu num grito, sua dupla corre. Quem cai joga no automático.</p>
      </Section>
      <div className="flex justify-center pt-1">
        <CardRow codes={['3s', '2h', 'Ac']} size="sm" fan />
      </div>
    </div>
  )
}

function Empates() {
  return (
    <div className="space-y-2">
      <Section title="Cangou (empate na vaza)">
        <p>Duas maiores iguais de duplas diferentes empatam a vaza. Começa a próxima quem começou a empatada.</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            Empatou a <Key>1ª</Key>: quem ganhar a 2ª leva. Se a 2ª empatar também, a 3ª decide.
          </li>
          <li>
            Ganhou a 1ª e empatou a <Key>2ª ou a 3ª</Key>: leva quem ganhou a 1ª.
          </li>
          <li>
            Empatou <Key>tudo</Key>: ninguém marca.
          </li>
        </ul>
        <p>No 2x2, se as duas maiores são da mesma dupla, essa dupla leva — não é empate.</p>
      </Section>
    </div>
  )
}
