import * as React from "react";
import {
  ArrowLeft,
  Crown,
  Eye,
  Flag,
  Handshake,
  ListOrdered,
  Loader2,
  UserPlus,
} from "lucide-react";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { GameIcon } from "@/components/social/GameIcon";
import { resolveAssetUrl } from "@/lib/api";
import {
  boardGameLabel,
  boardReasonLabel,
  sideIsLight,
  sideLabel,
  type BoardAck,
  type BoardPerson,
  type BoardTableView,
  type Side,
} from "@/lib/api-board";
import { useAuth } from "@/lib/auth-context";
import { useBoard } from "@/lib/board-context";
import {
  clockNow,
  material,
  START_POSITION,
  type Material,
} from "@/lib/board-position";
import { BRAND_MASK_STYLE } from "@/lib/brand-mask";
import { useLayout } from "@/lib/layout-context";
import { useMembers } from "@/lib/members-context";
import { useTicker } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { Board } from "./Board";
import { Clock } from "./Clock";
import { MoveList } from "./MoveList";
import { PieceGlyph } from "./pieces";
import "./board.css";

/**
 * A MESA ABERTA — lê tudo de `useBoard()` e muda de cara por fase: espera
 * (open/invited), combinado (pending), partida (playing) e fim (finished).
 *
 * A mesa está sempre posta: placa de cima, tabuleiro, placa de baixo. O que
 * muda por fase é o que FLUTUA sobre ela (`.board-veu`): esperando
 * adversário, a contagem pra começar, a faixa do resultado. Assim a tela
 * nunca fica vazia e o tabuleiro final continua ali atrás do resultado
 * (e dá pra espiar, com "Ver o tabuleiro").
 *
 * O servidor é a autoridade: a tela só desenha a vista e manda a ação. O
 * relógio anda localmente (`clockNow` + relógio compartilhado do projeto) a
 * partir do retrato do servidor; a cada lance chega um retrato novo. As
 * peças capturadas e a vantagem de material saem da posição (lib/board-position).
 *
 * Meu lado fica embaixo; quem assiste vê as brancas embaixo. `children` é a
 * coluna lateral extra (as apostas), abaixo da lista de lances.
 */

const LOW_MS = 10_000;
/** Referência estável: um [] novo a cada tick refazia os memos do tabuleiro. */
const NO_MOVES: string[] = [];

const fmtMurchos = (n: number): string =>
  `${n.toLocaleString("pt-BR")} murchos`;

const other = (side: Side): Side => (side === "white" ? "black" : "white");
/** Quanto o servidor espera pelo primeiro lance antes de cancelar a mesa. */
const FIRST_MOVE_MS = 30_000;
/** Quanto tempo "Analisando…" fica na tela depois do resultado. */
const ANALYSIS_WAIT_MS = 90_000;
/** Análise só roda no xadrez e em partida com pelo menos isto de lances (plies). */
const ANALYSIS_MIN_PLIES = 10;

/** "Fulano venceu por xeque-mate" / "Empate por acordo". */
function resultHeadline(table: BoardTableView): string {
  const result = table.result;
  if (!result) return "";
  if (result.reason === "settle-error") return "Erro no acerto da partida";
  if (result.winner) {
    const name = table[result.winner]?.displayName ?? "Alguém";
    return `${name} venceu por ${boardReasonLabel(result.reason)}`;
  }
  return result.reason === "agreement"
    ? "Empate por acordo"
    : `Empate por ${boardReasonLabel(result.reason)}`;
}

export function BoardTable({ children }: { children?: React.ReactNode }) {
  const {
    table,
    closeTable,
    cancelTable,
    setReady,
    move,
    resign,
    offerDraw,
    answerDraw,
  } = useBoard();
  const { user } = useAuth();
  const { isPhone } = useLayout();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  // Espelho do `busy` fora do ciclo de render: o `run` é estável (useCallback)
  // pra que o tabuleiro memoizado não refaça a árvore a cada tique do relógio.
  const busyRef = React.useRef(false);
  /** Confirmação em dois cliques no próprio botão (desistir, sair). */
  const [confirm, setConfirm] = React.useState<"resign" | "leave" | null>(null);
  /** "Ver o tabuleiro": esconde a faixa do resultado pra olhar a posição final. */
  const [peek, setPeek] = React.useState(false);

  const phase = table?.phase ?? null;
  const tableId = table?.id ?? null;
  // Relógio compartilhado: 100 ms na partida (décimos abaixo de 10 s), 250 ms
  // na contagem do pending, parado nas outras fases.
  const now = useTicker(
    phase === "playing" ? 100 : 250,
    phase === "playing" || phase === "pending",
  );

  // A posição vem sempre do servidor; o fallback só garante a mesa posta.
  const game = table?.game ?? null;
  const position = table?.position || (game ? START_POSITION[game] : "");
  const mat = React.useMemo(
    (): Material | null => (game && position ? material(game, position) : null),
    [game, position],
  );

  React.useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4_500);
    return () => clearTimeout(t);
  }, [error]);

  // A confirmação some sozinha se a pessoa desistir de clicar.
  React.useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(null), 4_000);
    return () => clearTimeout(t);
  }, [confirm]);

  // Fase nova (ou mesa nova): confirmações antigas não valem e a faixa volta.
  React.useEffect(() => {
    setConfirm(null);
    setPeek(false);
  }, [phase, tableId]);

  const run = React.useCallback(
    async (fn: () => Promise<BoardAck>): Promise<void> => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        const ack = await fn();
        if (!ack.ok) setError(ack.error ?? "Deu ruim.");
      } catch {
        setError("Deu ruim. Tente de novo.");
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [],
  );
  const onMove = React.useCallback(
    (m: string): void => void run(() => move(m)),
    [run, move],
  );

  if (!table || !game) return null;

  const label = boardGameLabel(table.game, table.variant);
  const mySide = table.mySide;
  const bottom: Side = mySide ?? "white";
  const top = other(bottom);
  const waiting = table.phase === "open" || table.phase === "invited";
  const pending = table.phase === "pending";
  const playing = table.phase === "playing";
  const finished = table.phase === "finished";
  const isHost = table.host.userId === user?.id;
  const iAmPlayer = mySide !== null;

  const clocks = clockNow(
    table.clocks,
    table.clockAt,
    table.clockRunning,
    table.turn,
    now,
  );
  const myTurn = playing && !table.result && mySide === table.turn;
  const drawFromOpponent =
    !!mySide && table.drawOfferBy !== null && table.drawOfferBy !== mySide;
  const drawFromMe = !!mySide && table.drawOfferBy === mySide;

  const secsToFirstMove =
    playing && !table.result && table.moves.length === 0
      ? Math.max(0, Math.ceil((table.clockAt + FIRST_MOVE_MS - now) / 1000))
      : null;
  const secsToStart =
    pending && table.startsAt
      ? Math.max(0, Math.ceil((table.startsAt - now) / 1000))
      : null;
  const showClock = playing || finished;
  const worth =
    table.stake > 0 ? `valendo ${fmtMurchos(table.stake)}` : "sem valor";

  // Esperando: a mesa já está posta — o anfitrião embaixo, o convidado (se
  // houver) em cima; os lados só existem quando a partida combina.
  const bottomPerson = waiting ? table.host : table[bottom];
  const topPerson = waiting ? table.invited : table[top];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="relative z-conteudo flex shrink-0 items-center gap-2 border-b border-line/50 bg-void/40 px-2 py-1.5 backdrop-blur-sm sm:px-3">
        {(playing || finished || !iAmPlayer) && (
          <Button variant="ghost" size="sm" onClick={closeTable}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden />
            Saguão
          </Button>
        )}
        <GameIcon game={table.game} className="h-5 w-5 shrink-0 text-acid" />
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-sm font-semibold leading-tight text-foreground">
            {label}
          </p>
          <p className="truncate text-[11.5px] leading-tight text-muted-foreground">
            <span className="font-mono">{table.clock}</span> · {worth}
            {table.spectators > 0 && (
              <>
                {" "}
                · <Eye className="inline h-3 w-3" aria-hidden />{" "}
                <span className="font-mono">{table.spectators}</span>
              </>
            )}
          </p>
        </div>
      </header>

      <div
        className={cn(
          "flex min-h-0 flex-1",
          isPhone ? "flex-col overflow-y-auto" : "flex-row",
        )}
      >
        {/* O palco: a mesa posta e o que flutua sobre ela */}
        <div
          className={cn(
            "board-palco p-2 sm:p-3",
            isPhone ? "shrink-0" : "min-h-0 flex-1",
          )}
        >
          <span
            aria-hidden
            className="board-palco-marca"
            style={BRAND_MASK_STYLE}
          />
          <div className={cn("board-area", isPhone && "board-area--fone")}>
            <div className={cn("board-mesa", waiting && "board-mesa--espera")}>
              <PlayerBar
                person={topPerson}
                side={waiting ? null : top}
                table={table}
                clocks={clocks}
                showClock={showClock}
                material={mat}
              />
              <Board
                game={table.game}
                variant={table.variant}
                position={position}
                orientation={bottom}
                legalMoves={myTurn ? table.legalMoves : NO_MOVES}
                lastMove={table.lastMove}
                onMove={myTurn ? onMove : undefined}
              />
              <PlayerBar
                person={bottomPerson}
                side={waiting ? null : bottom}
                table={table}
                clocks={clocks}
                showClock={showClock}
                material={mat}
              />
            </div>
          </div>
          {secsToFirstMove !== null && (
            <p className="board-aviso">
              Primeiro lance em{" "}
              <span className="font-mono text-foreground">
                {secsToFirstMove}s
              </span>{" "}
              ou a partida é cancelada
            </p>
          )}

          {waiting && (
            <div className="board-veu">
              <div className="board-faixa board-faixa--acid" role="status">
                <div
                  className="board-medalhao board-medalhao--espera"
                  aria-hidden
                >
                  <span
                    className="board-medalhao-marca"
                    style={BRAND_MASK_STYLE}
                  />
                </div>
                <p className="board-faixa-titulo">
                  {table.phase === "invited" && table.invited
                    ? `Convite enviado para ${table.invited.displayName}`
                    : "Aguardando adversário"}
                </p>
                <p className="board-faixa-sub">
                  {label} · <span className="font-mono">{table.clock}</span> ·{" "}
                  {worth}
                </p>
                {error && (
                  <ErrorLine message={error} className="mt-3 text-left" />
                )}
                <div className="board-faixa-acoes">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      isHost
                        ? void run(() => cancelTable(table.id))
                        : closeTable()
                    }
                  >
                    {isHost ? "Cancelar mesa" : "Voltar ao saguão"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {pending && (
            <div className="board-veu">
              <div className="board-faixa board-faixa--acid" role="status">
                {secsToStart !== null ? (
                  <>
                    <p className="board-faixa-sub">A partida começa em</p>
                    <p
                      className="board-contagem"
                      aria-label={`${secsToStart} segundos`}
                    >
                      {secsToStart}
                    </p>
                  </>
                ) : (
                  <p className="board-faixa-titulo">Partida combinada</p>
                )}
                <div className="board-faixa-lados">
                  {(["white", "black"] as const).map((side) => (
                    <div key={side} className="board-faixa-lado">
                      <PieceGlyph
                        piece={{
                          side,
                          kind: table.game === "chess" ? "k" : "man",
                        }}
                        light={sideIsLight(table.game, table.variant, side)}
                        className="board-peca--mini"
                      />
                      <span className="board-faixa-lado-nome">
                        {table[side]?.displayName ?? "—"}
                      </span>
                      <span className="text-[11.5px]">
                        {sideLabel(table.game, table.variant, side)}
                      </span>
                      <span
                        className={cn(
                          "board-pronto",
                          !table.ready[side] && "board-pronto--nao",
                        )}
                      >
                        {table.ready[side] ? "pronto" : "esperando"}
                      </span>
                    </div>
                  ))}
                </div>
                {table.stake > 0 && (
                  <p className="board-faixa-sub mt-3">
                    Valendo{" "}
                    <span className="font-mono text-foreground">
                      {fmtMurchos(table.stake)}
                    </span>{" "}
                    pra cada um.
                  </p>
                )}
                {error && (
                  <ErrorLine message={error} className="mt-3 text-left" />
                )}
                {iAmPlayer && (
                  <div className="board-faixa-acoes">
                    {!table.ready[mySide] && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void run(setReady)}
                      >
                        Pronto
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={
                        confirm === "leave" ? "destructive" : "secondary"
                      }
                      className={cn(
                        confirm === "leave" &&
                          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                      )}
                      onClick={() => {
                        if (confirm !== "leave") return setConfirm("leave");
                        setConfirm(null);
                        void run(() => cancelTable(table.id));
                      }}
                    >
                      {confirm === "leave"
                        ? "Sair cancela a partida. Confirmar?"
                        : "Sair"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {finished && !peek && (
            <div className="board-veu">
              <ResultBanner
                table={table}
                onLeave={closeTable}
                onPeek={() => setPeek(true)}
              />
            </div>
          )}
        </div>

        {/* Coluna lateral: situação, lances e o que a tela de cima quiser pôr */}
        <aside
          className={cn(
            "board-painel flex shrink-0 flex-col gap-3 border-line p-3",
            isPhone ? "border-t" : "min-h-0 w-72 overflow-y-auto border-l",
          )}
        >
          {error && !waiting && !pending && <ErrorLine message={error} />}

          {playing && iAmPlayer && !table.result && (
            <div className="flex flex-col gap-2">
              <p className={cn("board-vez", myTurn && "board-vez--minha")}>
                <span className="board-vez-ponto" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  {myTurn
                    ? "Sua vez"
                    : `Vez de ${table[table.turn]?.displayName ?? sideLabel(table.game, table.variant, table.turn)}`}
                </span>
              </p>
              {drawFromOpponent && (
                <div className="board-secao gap-2 p-3">
                  <p className="flex items-center gap-2 text-xs text-foreground">
                    <Handshake className="h-3.5 w-3.5 text-burn" aria-hidden />
                    Seu adversário propôs empate.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void run(() => answerDraw(true))}
                    >
                      Aceitar
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void run(() => answerDraw(false))}
                    >
                      Recusar
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={confirm === "resign" ? "destructive" : "secondary"}
                  className={cn(
                    confirm === "resign" &&
                      "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                  )}
                  disabled={busy}
                  onClick={() => {
                    if (confirm !== "resign") return setConfirm("resign");
                    setConfirm(null);
                    void run(resign);
                  }}
                >
                  <Flag className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  {confirm === "resign" ? "Desistir mesmo?" : "Desistir"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || drawFromMe}
                  onClick={() => void run(offerDraw)}
                >
                  <Handshake className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  {drawFromMe ? "Empate proposto" : "Propor empate"}
                </Button>
              </div>
            </div>
          )}

          {playing && !iAmPlayer && !table.result && (
            <p className="board-vez">
              <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>Você está assistindo.</span>
            </p>
          )}

          {finished && (
            <div className="flex flex-col gap-2">
              <div className="board-resultado px-3 py-2">
                <p className="text-sm font-semibold text-burn">
                  {resultHeadline(table)}
                </p>
                {peek && (
                  <button
                    type="button"
                    onClick={() => setPeek(false)}
                    className="mt-1 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                  >
                    Ver o resultado de novo
                  </button>
                )}
              </div>
              <Button size="sm" onClick={closeTable}>
                Voltar ao saguão
              </Button>
            </div>
          )}

          {/* Lances só fazem sentido com partida (em andamento ou acabada). */}
          {(playing || finished) && (
            <div className="board-secao min-h-[8rem]">
              <h4 className="board-secao-cabeca">
                <ListOrdered className="h-3.5 w-3.5" aria-hidden />
                Lances
                <span className="board-secao-n">{table.moves.length}</span>
              </h4>
              <div className="flex max-h-64 min-h-0 flex-1 flex-col overflow-y-auto">
                <MoveList game={table.game} moves={table.moves} />
              </div>
            </div>
          )}

          {children}
        </aside>
      </div>
    </div>
  );
}

/** A placa de um lado: avatar, nome, cor, capturadas (ou "pronto") e relógio. */
function PlayerBar({
  person,
  side,
  table,
  clocks,
  showClock,
  material: mat,
}: {
  person: BoardPerson | null;
  /** Nulo enquanto a mesa espera: os lados só existem com a partida combinada. */
  side: Side | null;
  table: BoardTableView;
  clocks: { white: number; black: number };
  showClock: boolean;
  material: Material | null;
}) {
  const { byId } = useMembers();
  const member = person ? byId[person.userId] : undefined;
  const active =
    !!side && table.phase === "playing" && !table.result && table.turn === side;
  const won =
    !!side && table.phase === "finished" && table.result?.winner === side;
  const light = side ? sideIsLight(table.game, table.variant, side) : true;
  const captured = side && mat ? mat.captured[side] : [];
  const advantage =
    side && mat ? (side === "white" ? mat.advantage : -mat.advantage) : 0;

  let line: React.ReactNode = null;
  if (!person) {
    line = <span>esperando alguém sentar</span>;
  } else if (!side) {
    line = (
      <span>
        {person.userId === table.host.userId ? "anfitrião" : "convidado"}
      </span>
    );
  } else if (table.phase === "pending") {
    line = (
      <span
        className={cn(
          "board-pronto",
          !table.ready[side] && "board-pronto--nao",
        )}
      >
        {table.ready[side] ? "pronto" : "esperando"}
      </span>
    );
  } else if (captured.length > 0 || advantage > 0) {
    const victim = other(side);
    const victimLight = sideIsLight(table.game, table.variant, victim);
    line = (
      <>
        <span
          className="board-material"
          aria-label={`capturou ${captured.length} peça${captured.length === 1 ? "" : "s"}`}
        >
          {captured.map((kind, i) => (
            <PieceGlyph
              key={i}
              piece={{ side: victim, kind }}
              light={victimLight}
              className="board-peca--mini"
            />
          ))}
        </span>
        {advantage > 0 && <span className="board-vantagem">+{advantage}</span>}
      </>
    );
  } else {
    line = <span>{sideLabel(table.game, table.variant, side)}</span>;
  }

  return (
    <div
      className={cn(
        "board-jogador",
        active && "board-jogador--vez",
        won && "board-jogador--vencedor",
        !person && "board-jogador--vaga",
      )}
    >
      {person ? (
        <UserAvatar
          userId={person.userId}
          src={resolveAssetUrl(member?.avatar ?? person.avatar)}
          name={person.displayName}
          ringColor={member?.profileColor ?? undefined}
          className={cn(
            "board-avatar h-10 w-10",
            active && "board-avatar--vez",
            won && "board-avatar--vencedor",
          )}
        />
      ) : (
        <span className="board-avatar-vaga" aria-hidden>
          <UserPlus className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="board-nome">
          {side && (
            <PieceGlyph
              piece={{ side, kind: table.game === "chess" ? "k" : "man" }}
              light={light}
              className="board-peca--mini"
            />
          )}
          <span>
            {person?.displayName ??
              (table.phase === "invited" ? "Convidado" : "Vaga")}
          </span>
          {won && (
            <Crown
              className="h-3.5 w-3.5 shrink-0 text-burn"
              aria-label="venceu"
            />
          )}
          {side && (
            <span className="sr-only">
              {" "}
              ({sideLabel(table.game, table.variant, side)})
            </span>
          )}
        </p>
        <div className="board-placa-linha">{line}</div>
      </div>
      {showClock && side && (
        <Clock
          ms={clocks[side]}
          active={active && table.clockRunning}
          low={clocks[side] < LOW_MS}
        />
      )}
    </div>
  );
}

/** A faixa do fim: quem venceu e por quê, o valor, XP e a análise (quando já saiu). */
function ResultBanner({
  table,
  onLeave,
  onPeek,
}: {
  table: BoardTableView;
  onLeave: () => void;
  onPeek: () => void;
}) {
  const { byId } = useMembers();
  const result = table.result;
  const analysis = table.analysis;
  const winner = result?.winner ?? null;
  const winnerPerson = winner ? table[winner] : null;
  const winnerMember = winnerPerson ? byId[winnerPerson.userId] : undefined;
  const settleError = result?.reason === "settle-error";
  // A análise só roda no xadrez com lances suficientes; sem resposta em 90 s, desiste da espera.
  const mayAnalyse =
    table.game === "chess" &&
    table.moves.length >= ANALYSIS_MIN_PLIES &&
    !settleError;
  const [waiting, setWaiting] = React.useState(true);
  React.useEffect(() => {
    if (!mayAnalyse || analysis) return;
    const t = setTimeout(() => setWaiting(false), ANALYSIS_WAIT_MS);
    return () => clearTimeout(t);
  }, [mayAnalyse, analysis]);

  if (!result) return null;

  let title: string;
  let sub: string;
  if (settleError) {
    title = "Erro no acerto da partida";
    sub = "Os valores foram devolvidos.";
  } else if (winnerPerson) {
    title = `${winnerPerson.displayName} venceu`;
    sub = `por ${boardReasonLabel(result.reason)}`;
    if (table.stake > 0)
      sub += ` · leva ${fmtMurchos(table.stake)} do adversário`;
  } else {
    title = "Empate";
    sub = `por ${boardReasonLabel(result.reason)}`;
    if (table.stake > 0) sub += " · o valor volta pra cada um";
  }

  return (
    <div
      role="status"
      className={cn(
        "board-faixa",
        settleError
          ? "board-faixa--erro"
          : winner
            ? "board-faixa--ouro"
            : "board-faixa--acid",
      )}
    >
      {winnerPerson && !settleError ? (
        <UserAvatar
          userId={winnerPerson.userId}
          src={resolveAssetUrl(winnerMember?.avatar ?? winnerPerson.avatar)}
          name={winnerPerson.displayName}
          ringColor={winnerMember?.profileColor ?? undefined}
          className="board-avatar board-avatar--vencedor mx-auto mb-3 h-14 w-14"
        />
      ) : (
        <div className="board-medalhao" aria-hidden>
          <span className="board-medalhao-marca" style={BRAND_MASK_STYLE} />
        </div>
      )}
      <p className="board-faixa-titulo">{title}</p>
      <p className="board-faixa-sub">{sub}</p>

      {!settleError && (
        <div className="board-faixa-lados">
          {(["white", "black"] as const).map((side) => (
            <div
              key={side}
              className={cn(
                "board-faixa-lado",
                winner === side && "board-faixa-lado--vencedor",
              )}
            >
              <PieceGlyph
                piece={{ side, kind: table.game === "chess" ? "k" : "man" }}
                light={sideIsLight(table.game, table.variant, side)}
                className="board-peca--mini"
              />
              <span className="board-faixa-lado-nome">
                {table[side]?.displayName ?? "—"}
              </span>
              <span className="board-faixa-stat text-acid-text">
                +{result.xp[side] ?? 0} XP
              </span>
              {analysis && (
                <span
                  className="board-faixa-stat"
                  title="precisão · rating estimado"
                >
                  <span className="text-foreground">
                    {Math.round(analysis.accuracy[side])}%
                  </span>
                  {analysis.ratingEst[side] != null && (
                    <>
                      {" · "}
                      <span className="text-foreground">
                        {analysis.ratingEst[side]}
                      </span>
                    </>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {!analysis && mayAnalyse && waiting && (
        <p className="board-faixa-sub mt-3 flex items-center justify-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Analisando a partida…
        </p>
      )}

      <div className="board-faixa-acoes">
        <Button size="sm" onClick={onLeave}>
          Voltar ao saguão
        </Button>
        <Button size="sm" variant="ghost" onClick={onPeek}>
          Ver o tabuleiro
        </Button>
      </div>
    </div>
  );
}

/** Mesma linha de erro do saguão do pôquer. */
function ErrorLine({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <p
      role="alert"
      className={cn(
        "rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-xs text-destructive",
        className,
      )}
    >
      {message}
    </p>
  );
}
