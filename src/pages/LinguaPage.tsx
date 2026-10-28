import * as React from 'react'
import { Flame, Languages, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LanguageGrid } from '@/components/lingua/LanguageGrid'
import { LessonResult } from '@/components/lingua/LessonResult'
import { LessonView } from '@/components/lingua/LessonView'
import { PlacementTest } from '@/components/lingua/PlacementTest'
import { MissionsPanel } from '@/components/lingua/MissionsPanel'
import { PodiumPanel } from '@/components/lingua/PodiumPanel'
import { RankingPanel } from '@/components/lingua/RankingPanel'
import { VoiceSetup } from '@/components/lingua/VoiceSetup'
import { LEVELS, lingua, type AttemptView, type FinishResult, type Lang, type Level, type LinguaMe } from '@/lib/api-lingua'
import { useAuth } from '@/lib/auth-context'
import { useGamification } from '@/lib/gamification-context'
import { errorCode, errorMessage } from '@/lib/lingua-ui'
import { hasVoice } from '@/lib/lingua-tts'
import { cn } from '@/lib/utils'

/**
 * LÍNGUA MURCHA — o "Duolingo dos Bocas". Uma lição por língua por dia, sem
 * limite de erro: passa com 6/10, senão repete amanhã; as erradas voltam como
 * revisão nas lições seguintes. Ofensiva, missões da semana, ranking e pódio.
 *
 * Fluxo de abrir uma língua: sem nível → PlacementTest (o resultado fica no
 * localStorage até a 1ª lição); sem voz no sistema →
 * VoiceSetup (uma vez por sessão, dá pra seguir sem som); então `start` — que
 * devolve a tentativa já aberta se houver (retoma de `position`).
 */

type Tab = 'licoes' | 'ranking' | 'podio'

/**
 * Nível que saiu do nivelamento, até a 1ª lição gravá-lo no servidor (o
 * servidor só cria o progresso no `start`). Sem isto, sair no aviso de voz —
 * ou reiniciar pra ativar a voz instalada — jogava o teste fora.
 */
const placedKey = (lang: Lang) => `lingua-placed:${lang}`

function readPlaced(lang: Lang): Level | null {
  try {
    const v = localStorage.getItem(placedKey(lang))
    return v && (LEVELS as readonly string[]).includes(v) ? (v as Level) : null
  } catch {
    return null
  }
}

function writePlaced(lang: Lang, level: Level | null) {
  try {
    if (level) localStorage.setItem(placedKey(lang), level)
    else localStorage.removeItem(placedKey(lang))
  } catch {
    // Sem storage: só não lembra.
  }
}

const TABS: Array<{ id: Tab; nome: string }> = [
  { id: 'licoes', nome: 'Lições' },
  { id: 'ranking', nome: 'Ranking' },
  { id: 'podio', nome: 'Pódio' }
]

interface Finished {
  lang: Lang
  total: number
  lessonCount: number
  passMin: number
  result: FinishResult
}

export function LinguaPage() {
  const { token } = useAuth()
  const { refresh: refreshProfile } = useGamification()
  const [me, setMe] = React.useState<LinguaMe | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [tab, setTab] = React.useState<Tab>('licoes')

  const [picking, setPicking] = React.useState<Lang | null>(null)
  const [voiceFor, setVoiceFor] = React.useState<{ lang: Lang; level?: Level } | null>(null)
  const [busyLang, setBusyLang] = React.useState<Lang | null>(null)
  const [lesson, setLesson] = React.useState<AttemptView | null>(null)
  const [finished, setFinished] = React.useState<Finished | null>(null)

  // "Continuar sem som" vale pra sessão: não pergunta de novo a cada lição.
  const silentLangs = React.useRef(new Set<Lang>())

  const loadMe = React.useCallback(() => {
    if (!token) return
    lingua
      .me(token)
      .then((m) => {
        for (const l of m.langs) if (l.level) writePlaced(l.lang, null)
        setMe(m)
        setLoadError(null)
      })
      .catch((e) => setLoadError(errorMessage(errorCode(e))))
  }, [token])

  React.useEffect(loadMe, [loadMe])

  const begin = async (lang: Lang, level?: Level) => {
    if (!token) return
    setBusyLang(lang)
    setNotice(null)
    try {
      const attempt = await lingua.start(token, lang, level)
      setPicking(null)
      setLesson(attempt)
    } catch (e) {
      const code = errorCode(e)
      setPicking(null)
      if (code === 'level_required') {
        setPicking(lang)
        return
      }
      setNotice(errorMessage(code))
      if (code === 'already_done_today' || code === 'attempt_expired') loadMe()
    } finally {
      setBusyLang(null)
    }
  }

  const proceed = async (lang: Lang, level?: Level) => {
    setPicking(null)
    if (!silentLangs.current.has(lang)) {
      setBusyLang(lang)
      const ok = await hasVoice(lang)
      setBusyLang(null)
      if (!ok) {
        setVoiceFor({ lang, level })
        return
      }
    }
    await begin(lang, level)
  }

  const openLang = (lang: Lang) => {
    const state = me?.langs.find((l) => l.lang === lang)
    if (!state) return
    setFinished(null)
    const level = state.level ?? readPlaced(lang)
    if (level) void proceed(lang, state.level ? undefined : level)
    else setPicking(lang)
  }

  // Reabriu a página com lição em andamento: retoma
  // sozinho, uma vez — sair da lição e voltar pra lista não reabre.
  const autoResumed = React.useRef(false)
  React.useEffect(() => {
    if (!me || autoResumed.current) return
    autoResumed.current = true
    const pending = me.langs.find((l) => l.today === 'active')
    if (pending?.level) void proceed(pending.lang)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na primeira carga do /me
  }, [me])

  const backToList = (message: string | null) => {
    setLesson(null)
    setNotice(message)
    loadMe()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line/70 px-4 py-3 sm:px-6">
        <Languages className="h-8 w-8 shrink-0 text-acid" aria-hidden />
        <div className="min-w-0 flex-1">
          <h1 className="title-brutal text-2xl leading-none">Língua Murcha</h1>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
            Uma lição por língua por dia. Acertou 6 de 10, passa; o que errar volta pra revisão.
          </p>
        </div>
        {me && (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="flex items-center gap-1 font-mono text-burn" title="Ofensiva geral">
              <Flame className="h-4 w-4" aria-hidden />
              {me.generalStreak}
            </span>
            <span className="font-mono text-muted-foreground" title="XP da Língua Murcha nesta semana">
              {me.xpWeek} XP na semana
            </span>
          </div>
        )}
      </header>

      {!lesson && (
        <div
          role="tablist"
          aria-label="Língua Murcha"
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-3 py-2 [scrollbar-width:none] sm:px-5 [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id)
                setFinished(null)
              }}
              className={cn(
                'shrink-0 rounded-brutal border px-3 py-1.5 text-sm transition-colors',
                tab === t.id
                  ? 'border-acid/60 bg-acid/10 text-acid'
                  : 'border-transparent text-muted-foreground hover:bg-void-light hover:text-foreground'
              )}
            >
              {t.nome}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {notice && (
            <p role="alert" className="rounded-brutal border border-burn/50 bg-burn/10 px-3 py-2 text-sm text-burn">
              {notice}
            </p>
          )}

          {lesson && token ? (
            <LessonView
              key={lesson.attemptId}
              attempt={lesson}
              token={token}
              onFinish={(result) => {
                setFinished({
                  lang: lesson.lang,
                  total: lesson.questions.length,
                  lessonCount: lesson.lessonCount,
                  passMin: lesson.passMin,
                  result
                })
                setLesson(null)
                loadMe()
                void refreshProfile()
              }}
              onAbort={backToList}
              onExit={() => backToList(null)}
            />
          ) : finished ? (
            <LessonResult
              lang={finished.lang}
              total={finished.total}
              lessonCount={finished.lessonCount}
              passMin={finished.passMin}
              result={finished.result}
              onBack={() => setFinished(null)}
            />
          ) : tab === 'ranking' ? (
            <RankingPanel />
          ) : tab === 'podio' ? (
            <PodiumPanel />
          ) : loadError && !me ? (
            <div className="space-y-3 text-center">
              <p role="alert" className="text-sm text-destructive">
                {loadError}
              </p>
              <Button variant="secondary" size="sm" onClick={loadMe}>
                Tentar de novo
              </Button>
            </div>
          ) : !me ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
          ) : (
            <>
              <LanguageGrid langs={me.langs} busyLang={busyLang} onOpen={openLang} />
              <MissionsPanel langs={me.langs} />
            </>
          )}
        </div>
      </div>

      {picking && (
        <PlacementTest
          lang={picking}
          busy={busyLang !== null}
          onPick={(level) => {
            writePlaced(picking, level)
            void proceed(picking, level)
          }}
          onClose={() => setPicking(null)}
        />
      )}

      {voiceFor && (
        <VoiceSetup
          lang={voiceFor.lang}
          onContinue={() => {
            const { lang, level } = voiceFor
            silentLangs.current.add(lang)
            setVoiceFor(null)
            void begin(lang, level)
          }}
          onCancel={() => setVoiceFor(null)}
        />
      )}
    </div>
  )
}
