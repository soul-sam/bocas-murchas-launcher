import * as React from 'react'
import { BookOpen, Coins, Layers, ListOrdered, Scale, Users } from 'lucide-react'
import { HAND_RANKINGS, type HandCategory, type PokerRules } from '@/lib/api-poker'
import type { IconComponent } from '@/lib/icon-component'
import { cn } from '@/lib/utils'
import { CardRow } from './PlayingCard'

/**
 * A COLINHA — as dez combinações, da melhor pra pior, com exemplo desenhado,
 * como desempata e a chance de ter cada uma no river. E, nas outras abas,
 * as regras inteiras do Texas Hold'em sem limite e as regras DA NOSSA mesa
 * (buy-in, relógio, rake, o que acontece quando alguém some).
 *
 * Fica num componente só porque abre de dois lugares: do saguão (pra quem
 * nunca jogou) e de dentro da mesa, numa gaveta do lado, enquanto a mão
 * rola — e tem que ser a mesma colinha nos dois.
 */

type Tab = 'maos' | 'como' | 'apostas' | 'potes' | 'mesa'

const TABS: Array<{ id: Tab; label: string; Icon: IconComponent }> = [
  { id: 'maos', label: 'Combinações', Icon: ListOrdered },
  { id: 'como', label: 'Como joga', Icon: BookOpen },
  { id: 'apostas', label: 'Apostas', Icon: Coins },
  { id: 'potes', label: 'Potes e desempate', Icon: Layers },
  { id: 'mesa', label: 'Nossa mesa', Icon: Users }
]

export function HandRankings({
  rules,
  highlight,
  compact,
  initialTab = 'maos'
}: {
  rules: PokerRules | null
  /** Categoria da SUA mão agora — fica marcada na lista. */
  highlight?: HandCategory | null
  /** Dentro da mesa: menos respiro, tudo numa coluna. */
  compact?: boolean
  initialTab?: Tab
}) {
  const [tab, setTab] = React.useState<Tab>(initialTab)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label="Regras" className="flex shrink-0 flex-wrap gap-1 border-b border-line pb-2">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 rounded-brutal border px-2.5 py-1.5 text-xs transition-colors',
              tab === id
                ? 'border-acid/60 bg-acid/10 text-acid'
                : 'border-transparent text-muted-foreground hover:bg-void-light hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <div className="scroll-stable min-h-0 flex-1 overflow-y-auto pt-3">
        {tab === 'maos' && <Rankings highlight={highlight} compact={compact} />}
        {tab === 'como' && <HowToPlay />}
        {tab === 'apostas' && <Betting />}
        {tab === 'potes' && <Pots />}
        {tab === 'mesa' && <OurTable rules={rules} />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Rankings({ highlight, compact }: { highlight?: HandCategory | null; compact?: boolean }) {
  return (
    <ol className="space-y-1.5">
      {HAND_RANKINGS.map((entry, i) => {
        const mine = highlight === entry.category
        return (
          <li
            key={entry.category}
            className={cn(
              'rounded-brutal border px-3 py-2',
              mine ? 'border-acid/60 bg-acid/[0.07]' : 'border-line bg-void/60'
            )}
          >
            <div className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-right font-mono text-sm text-muted-foreground">{i + 1}</span>
              <p className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-foreground">
                <span className="truncate">{entry.name}</span>
                {mine && (
                  <span className="shrink-0 rounded-full border border-acid/60 bg-acid/10 px-1.5 font-mono text-[11px] font-bold text-acid">
                    a sua
                  </span>
                )}
              </p>
              <div className="shrink-0 text-right leading-tight">
                <p className="font-mono text-xs text-foreground">{formatOdds(entry.oddsRiver)}</p>
                <p className="text-[11px] text-muted-foreground">{entry.oneIn}</p>
              </div>
            </div>
            <div className="mt-1.5 pl-7">
              <CardRow codes={entry.example} size={compact ? 'sm' : 'md'} />
              <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{entry.what}</p>
              <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
                <span className="text-foreground">Desempate:</span> {entry.tie}
              </p>
            </div>
          </li>
        )
      })}
      <li className="px-3 pt-1 text-[11.5px] leading-snug text-muted-foreground">
        A chance é a de a sua MELHOR mão no river ser exatamente aquela, com as sete cartas (duas suas e cinco da mesa).
        Naipe nunca desempata: dois flushes iguais dividem o pote.
      </li>
    </ol>
  )
}

function formatOdds(pct: number): string {
  if (pct < 0.01) return `${pct.toFixed(4)}%`
  if (pct < 1) return `${pct.toFixed(2)}%`
  return `${pct.toFixed(1)}%`
}

// ---------------------------------------------------------------------------

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

function HowToPlay() {
  return (
    <div className="space-y-2">
      <Section title="O objetivo">
        <p>
          Levar o pote. Dá pra fazer isso de dois jeitos: tendo a <Key>melhor mão de cinco cartas</Key> no
          showdown, ou fazendo <Key>todo mundo desistir</Key> antes dele. A segunda vale tanto quanto a primeira.
        </p>
      </Section>
      <Section title="As cartas">
        <p>
          Cada um recebe <Key>duas cartas só suas</Key> (viradas pra baixo). Ao longo da mão, <Key>cinco cartas
          comunitárias</Key> abrem na mesa, pra todo mundo usar. A sua mão é a melhor combinação de cinco entre as
          sete — pode usar as duas suas, uma, ou nenhuma (aí "a mesa joga" e quem tiver a mesma mão divide).
        </p>
      </Section>
      <Section title="O botão e as blinds">
        <p>
          O <Key>botão (D)</Key> marca o dealer e gira uma casa à esquerda a cada mão. Quem está à esquerda do
          botão paga o <Key>small blind</Key>; o seguinte paga o <Key>big blind</Key> (o dobro). São apostas
          obrigatórias que garantem que sempre tem algo no pote pra disputar.
        </p>
        <p>
          <Key>Com dois jogadores</Key> (heads-up) a regra inverte um pouco: o botão paga o small blind, age
          primeiro antes do flop e por último depois dele.
        </p>
      </Section>
      <Section title="As quatro rodadas">
        <ol className="list-decimal space-y-1 pl-4">
          <li>
            <Key>Pré-flop</Key>: com as duas cartas na mão, a ação começa à esquerda do big blind. O big blind
            age por último e, se ninguém aumentou, pode só dar check (a "opção").
          </li>
          <li>
            <Key>Flop</Key>: três cartas abrem na mesa. Daqui em diante a ação começa no primeiro jogador à
            esquerda do botão que ainda está na mão.
          </li>
          <li>
            <Key>Turn</Key>: a quarta carta.
          </li>
          <li>
            <Key>River</Key>: a quinta e última. Depois dela, se sobrou mais de um, é showdown.
          </li>
        </ol>
      </Section>
      <Section title="Showdown">
        <p>
          Quem apostou por último mostra primeiro; os outros mostram em seguida, no sentido horário. A melhor
          mão leva o pote (ou divide, se empatar). Quando todo mundo desiste pra um só, ele leva sem mostrar — e
          pode mostrar se quiser, só pra provocar.
        </p>
      </Section>
    </div>
  )
}

function Betting() {
  return (
    <div className="space-y-2">
      <Section title="As cinco jogadas">
        <ul className="space-y-1">
          <li>
            <Key>Check (passar)</Key>: não aposta nada e passa a vez. Só vale se ninguém apostou na rodada.
          </li>
          <li>
            <Key>Bet (apostar)</Key>: abre a aposta da rodada. Mínimo: um big blind.
          </li>
          <li>
            <Key>Call (pagar)</Key>: iguala a maior aposta da rodada pra continuar na mão.
          </li>
          <li>
            <Key>Raise (aumentar)</Key>: paga e põe mais por cima. Na tela o valor é o TOTAL pra onde a aposta
            vai ("aumentar para 300"), não o acréscimo.
          </li>
          <li>
            <Key>Fold (desistir)</Key>: larga as cartas e abre mão do que já pôs no pote. Pode desistir a
            qualquer momento da sua vez.
          </li>
        </ul>
      </Section>
      <Section title="Sem limite">
        <p>
          É <Key>no-limit</Key>: dá pra apostar tudo o que tem na mesa a qualquer momento (<Key>all-in</Key>). O
          que você NÃO pode é apostar o que não está na mesa — fichas compradas depois só entram na próxima mão.
        </p>
      </Section>
      <Section title="Aumento mínimo">
        <p>
          Um aumento tem que ser <Key>pelo menos do tamanho do último aumento</Key> da rodada. Se alguém apostou
          100 e outro aumentou pra 300 (aumento de 200), o próximo aumento vai pra no mínimo 500. Antes de
          qualquer aumento, o mínimo é um big blind.
        </p>
        <p>
          <Key>All-in menor que o mínimo</Key> vale, mas não "reabre" a ação: quem já tinha agido pode pagar ou
          desistir, não pode aumentar de novo. É o que impede dois jogadores de se revezarem em aumentinhos
          pra espremer um terceiro.
        </p>
      </Section>
      <Section title="Quando a rodada fecha">
        <p>
          Quando todo mundo que ainda pode agir <Key>igualou a maior aposta</Key> (ou desistiu). Se sobrou só um
          com fichas pra apostar e os outros estão all-in, não há mais o que decidir: a mesa corre sozinha até
          o river (o "run-out").
        </p>
      </Section>
      <Section title="Blind sem fichas">
        <p>
          Quem tem menos que o blind entra all-in pelo que tem. Nada de "dever" pro pote.
        </p>
      </Section>
    </div>
  )
}

function Pots() {
  return (
    <div className="space-y-2">
      <Section title="Pote principal e potes laterais">
        <p>
          Quem foi all-in com menos fichas <Key>só disputa o que conseguiu cobrir</Key>. Exemplo: A tem 300 e vai
          all-in; B e C pagam e seguem apostando. Os 300 de cada um (900) formam o pote principal, que A pode
          ganhar. O que B e C apostarem acima disso vai pra um pote lateral, só entre os dois.
        </p>
        <p>Cada pote é decidido separadamente: dá pra ganhar o lateral e perder o principal.</p>
      </Section>
      <Section title="Aposta que ninguém pagou">
        <p>
          Se você aposta 500 e o único adversário tem 100 (ou todo mundo desiste), os <Key>400 que ninguém cobriu
          voltam pra você</Key> antes de o pote ser dividido. Não existe ganhar do próprio dinheiro.
        </p>
      </Section>
      <Section title="Kicker">
        <p>
          Quando duas mãos têm a mesma combinação (par de ases contra par de ases), decide a <Key>carta mais alta
          de fora</Key> — o kicker. Se também empatar, a seguinte, até completar as cinco cartas. Só cinco contam:
          a sexta e a sétima não existem.
        </p>
      </Section>
      <Section title="Empate e a ficha ímpar">
        <p>
          Mãos iguais <Key>dividem o pote</Key>. Quando não dá pra dividir exato, a ficha que sobra vai pro
          primeiro jogador à esquerda do botão. Naipe nunca desempata nada.
        </p>
      </Section>
      <Section title="A mesa joga">
        <p>
          Se as cinco melhores cartas são as cinco da mesa (uma sequência aberta, por exemplo), ninguém tem
          vantagem e <Key>todo mundo que ficou na mão divide</Key>. É mais comum do que parece.
        </p>
      </Section>
    </div>
  )
}

function OurTable({ rules }: { rules: PokerRules | null }) {
  const normal = rules ? Math.round(rules.timers.normal / 1000) : 60
  const turbo = rules ? Math.round(rules.timers.turbo / 1000) : 20
  const rakePct = rules?.rake.percent ?? 0
  const rakeCap = rules?.rake.capBb ?? 3
  const missed = rules?.missedTurnsToSitOut ?? 2
  const kick = rules?.sitOutKickMinutes ?? 10

  return (
    <div className="space-y-2">
      <Section title="Fichas são murchos">
        <p>
          O <Key>buy-in sai do seu saldo na hora</Key> de sentar e vira a sua pilha na mesa. Ao levantar, o que
          estiver na pilha volta pro saldo. Nada é criado nem some: o murcho só muda de mão.
        </p>
        <p>
          Cada mesa aceita buy-in entre <Key>20 e 100 big blinds</Key>. Zerou? Dá pra recarregar (até o teto da
          mesa); a recarga paga no meio de uma mão entra na seguinte.
        </p>
      </Section>
      <Section title="As mesas">
        <ul className="space-y-1">
          {(rules?.stakes ?? []).map((s) => (
            <li key={s.id}>
              <Key>{s.name}</Key>: blinds {s.smallBlind}/{s.bigBlind}, buy-in de {s.minBuyInBb * s.bigBlind} a{' '}
              {s.maxBuyInBb * s.bigBlind} murchos.
            </li>
          ))}
          {!rules && <li>Baixa 5/10 · Média 25/50 · Alta 100/200, buy-in de 20 a 100 big blinds.</li>}
        </ul>
        <p>De 2 a 6 lugares por mesa. Até seis mesas abertas ao mesmo tempo.</p>
      </Section>
      <Section title="O relógio">
        <p>
          Cada jogada tem <Key>{normal} segundos</Key> (mesa normal) ou <Key>{turbo}</Key> (turbo). Estourou: a
          mesa dá check por você se der, senão desiste. <Key>{missed} vezes seguidas</Key> e você senta fora até
          abrir a mesa de novo. Sentado fora (ou zerado) por <Key>{kick} minutos</Key>, a mesa te levanta e
          devolve as fichas.
        </p>
        <p>
          Fechou a tela sem levantar? Você continua sentado e o relógio continua valendo. A barra de ícones avisa
          quando é a sua vez.
        </p>
      </Section>
      {rakePct > 0 ? (
        <Section title="Rake pro cofre da casa">
          <p>
            Mão que viu o flop deixa <Key>{rakePct}% do pote, até {rakeCap} big blinds</Key>, no cofre da casa — o
            mesmo que banca o bônus de grupo e o pote das apostas. Mão que acaba no pré-flop não paga nada ("sem
            flop, sem rake").
          </p>
        </Section>
      ) : (
        <Section title="Sem rake">
          <p>
            A casa <Key>não tira nada do pote</Key>: quem ganha a mão leva tudo.
          </p>
        </Section>
      )}
      <Section title="Mesa, chat e badges">
        <p>
          Abrir uma mesa posta um card no canal de jogos, com quem está sentado; fecha quando a mesa fecha. Toda
          mão rendendo XP (com teto por dia), e há badges pra primeira mesa, primeiro pote, quadra ou melhor,
          royal flush, levar um pote com 7-2, dobrar num all-in, um pote de 100 blinds e cem potes.
        </p>
        <p>
          Se o servidor reiniciar no meio de uma mão, a mão é cancelada e as fichas voltam pra cada um do jeito
          que estavam antes dela começar.
        </p>
      </Section>
      <Section title="Cavalheirismo">
        <p>
          <Scale className="mr-1 inline h-3 w-3" aria-hidden />É entre amigos: nada de levantar na frente de um
          pote grande pra fugir, nem de combinar jogada por fora. O baralho é embaralhado com gerador
          criptográfico; ninguém, nem o admin, vê carta de ninguém.
        </p>
      </Section>
    </div>
  )
}
