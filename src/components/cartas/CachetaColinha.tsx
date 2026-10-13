import * as React from 'react'
import { Check, Sparkles, X } from 'lucide-react'
import type { CachetaView } from '@/lib/api-cartas'
import { parseCard, RANK_FACE } from '@/lib/api-poker'
import { cn } from '@/lib/utils'
import { PlayingCard } from '@/components/poker/PlayingCard'
import './cacheta.css'

/**
 * A COLINHA DA CACHETA — o que vale como jogo, o curinga, a vez, como bater e
 * como se perde ponto. Abre na gaveta do lado, com a partida rolando; quando
 * vem a vista da rodada, o curinga DESTA rodada aparece em destaque (é a
 * pergunta que todo mundo faz: "qual é o curinga mesmo?").
 *
 * O texto segue o que o servidor confere (lib/cartas/melds.ts na API): se a
 * regra mudar lá, muda aqui.
 */

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

/** Uma fileira de exemplo: as cartas e se vale ou não. `*` no código = curinga. */
function Example({ codes, ok, label }: { codes: string[]; ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="inline-flex shrink-0 gap-1">
        {codes.map((code, i) => {
          const wild = code.endsWith('*')
          return (
            <span key={`${code}-${i}`} className="relative inline-flex">
              <PlayingCard code={wild ? code.slice(0, -1) : code} size="sm" />
              {wild && (
                <span className="cacheta-selo cacheta-selo--curinga !bottom-0.5 !right-0.5 !h-3.5 !w-3.5" aria-label="curinga">
                  <Sparkles className="h-2.5 w-2.5" aria-hidden />
                </span>
              )}
            </span>
          )
        })}
      </span>
      <span className={cn('flex min-w-0 items-center gap-1 text-[11.5px]', ok ? 'text-acid-text' : 'text-destructive')}>
        {ok ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <X className="h-3.5 w-3.5 shrink-0" aria-hidden />}
        <span className="text-muted-foreground">{label}</span>
      </span>
    </div>
  )
}

const COLOR_LABEL = { red: 'vermelho', black: 'preto' } as const

export function CachetaColinha({ view }: { view: CachetaView | null }) {
  const wild = view?.wild ?? null
  const vira = view?.vira ?? null
  const wildRank = wild ? parseCard(`${wild.rank}s`)?.rank : undefined

  return (
    <div className="scroll-stable min-h-0 flex-1 space-y-2 overflow-y-auto pb-2">
      {wild && vira && (
        <section className="rounded-brutal border border-burn/50 bg-burn/[0.06] px-3 py-2.5">
          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-burn" aria-hidden />
            O curinga desta rodada
          </h4>
          <div className="flex items-center gap-3">
            <span className="flex flex-col items-center gap-1">
              <PlayingCard code={vira} size="ms" />
              <span className="text-[11px] text-muted-foreground">a vira</span>
            </span>
            <span className="text-lg text-muted-foreground" aria-hidden>
              →
            </span>
            <span className="flex flex-col items-center gap-1">
              <span className="inline-flex gap-1">
                {wild.cards.map((c) => (
                  <PlayingCard key={c} code={c} size="ms" />
                ))}
              </span>
              <span className="text-[11px] text-burn">
                {wildRank ? RANK_FACE[wildRank] : wild.rank} {COLOR_LABEL[wild.color]} — os dois baralhos
              </span>
            </span>
          </div>
        </section>
      )}

      <Section title="O objetivo">
        <p>
          Cada um recebe <Key>9 cartas</Key>. Na sua vez você compra uma e descarta outra, até conseguir dividir a mão
          inteira em <Key>jogos</Key> — aí você <Key>bate</Key> e todo mundo perde ponto. Quem chega a zero sai; o
          último de pé leva o bolo.
        </p>
      </Section>

      <Section title="Trinca">
        <p>
          <Key>3 ou 4 cartas do mesmo valor, de naipes diferentes</Key>. São dois baralhos, então dá pra ter dois 7 de
          copas na mão — mas na mesma trinca, não.
        </p>
        <Example codes={['7h', '7s', '7c']} ok label="três naipes diferentes" />
        <Example codes={['9s', '9h', '9d', '9c']} ok label="trinca de quatro" />
        <Example codes={['7h', '7h', '7c']} ok={false} label="naipe repetido" />
      </Section>

      <Section title="Sequência">
        <p>
          <Key>3 ou mais cartas seguidas do mesmo naipe</Key>. O ás vale embaixo (A-2-3) ou em cima (Q-K-A), mas a
          sequência não dá a volta.
        </p>
        <Example codes={['4c', '5c', '6c', '7c']} ok label="quatro seguidas" />
        <Example codes={['Ad', '2d', '3d']} ok label="ás embaixo" />
        <Example codes={['Qs', 'Ks', 'As']} ok label="ás em cima" />
        <Example codes={['Kh', 'Ah', '2h']} ok={false} label="não dá a volta" />
        <Example codes={['4c', '5d', '6c']} ok={false} label="naipe misturado" />
      </Section>

      <Section title="O curinga">
        <p>
          Depois de dar as cartas, uma é virada: a <Key>vira</Key>. O curinga é o <Key>valor seguinte</Key> (vira 7 →
          curinga 8; vira K → ás; vira ás → 2) <Key>da mesma cor</Key> da vira. Como são dois baralhos, existem{' '}
          <Key>quatro curingas</Key> na rodada.
        </p>
        <p>
          O curinga tapa o buraco de qualquer jogo, mas <Key>no máximo um por jogo</Key>, e todo jogo precisa de pelo
          menos <Key>duas cartas de verdade</Key>. E ele também vale como ele mesmo, se encaixar.
        </p>
        <Example codes={['5h', '8d*', '7h']} ok label="o curinga é o 6" />
        <Example codes={['Jc', 'Js', '8h*']} ok label="trinca com curinga" />
        <Example codes={['5h', '8d*', '8h*']} ok={false} label="dois curingas no mesmo jogo" />
      </Section>

      <Section title="A vez">
        <ol className="list-decimal space-y-1 pl-4">
          <li>
            <Key>Compre</Key>: do <Key>monte</Key> (às cegas) ou a carta de cima do <Key>lixo</Key> (todo mundo vê o que
            você pegou).
          </li>
          <li>
            <Key>Descarte</Key> uma carta no lixo — ou <Key>bata</Key>. Não dá pra devolver no lixo a mesma carta que
            você acabou de pegar dele.
          </li>
        </ol>
        <p>
          Na mesa: clique no monte ou no lixo pra comprar; clique numa carta e em <Key>Descartar</Key> (ou dois cliques
          nela). Arraste as cartas pra arrumar a mão, ou use <Key>Organizar</Key>. Atalhos: <Key>M</Key> monte,{' '}
          <Key>L</Key> lixo, <Key>D</Key> descartar, <Key>B</Key> bater.
        </p>
      </Section>

      <Section title="Bater">
        <p>
          Com as 10 cartas na mão (depois de comprar):
        </p>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <Key>Bater com 9</Key>: descarta uma e as 9 que sobram se dividem todas em jogos. Cada adversário perde{' '}
            <Key>1 ponto</Key>.
          </li>
          <li>
            <Key>Bater com 10</Key>: as 10 se dividem todas em jogos, sem descarte (um jogo de 4, ou uma sequência
            maior). Cada adversário perde <Key>2 pontos</Key>.
          </li>
        </ul>
        <p>O botão de bater só acende quando a mão bate de verdade — a mesa confere por você.</p>
      </Section>

      <Section title="Pontos e eliminação">
        <p>
          Todo mundo começa com os mesmos pontos (<Key>{view?.startPoints ?? 5}</Key>
          {view ? ' nesta mesa' : ', ou 10 na partida longa'}). Chegou a <Key>zero</Key>, está fora. A rodada seguinte
          é dada só pra quem sobrou, e quem dá gira a cada rodada.
        </p>
        <p>
          <Key>Ganha o último de pé</Key> e leva o bolo inteiro (o valor que cada um casou ao começar).
        </p>
      </Section>

      <Section title="Quando o monte acaba">
        <p>
          O lixo (menos a carta de cima) é embaralhado e vira monte de novo. Se nem isso der, a rodada termina{' '}
          <Key>empatada</Key>: ninguém perde ponto e as cartas são dadas de novo.
        </p>
      </Section>

      <Section title="O relógio">
        <p>
          Cada vez tem relógio. Estourou, a mesa joga por você: bate se der, senão compra do monte e descarta a carta
          que menos ajuda. Quem cai da conexão joga no relógio curto até voltar.
        </p>
      </Section>
    </div>
  )
}
