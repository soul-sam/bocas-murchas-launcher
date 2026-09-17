import * as React from 'react'
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Download,
  Info,
  Loader2,
  MoreVertical,
  Share,
  SquarePlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SwitchRow } from '@/components/ui/switch'
import { useAuth } from '@/lib/auth-context'
import { useInstallState } from '@/lib/use-install'
import { promptInstall } from '@/lib/pwa-install'
import {
  detectPushSupport,
  getCurrentSubscription,
  listDevices,
  PushNotConfiguredError,
  sendTestPush,
  subscribeToPush,
  unsubscribeFromPush,
  type PushDevice,
  type PushSupport,
} from '@/lib/push'

/**
 * Aba "Celular" das configurações — só existe na WEB.
 *
 * No launcher de desktop nada aqui faz sentido: a notificação é nativa (pelo
 * `window.bocas.notify`) e não há o que instalar. Por isso o SettingsModal só
 * monta esta aba quando `isWeb()`.
 *
 * Ela junta as duas coisas porque elas são a MESMA coisa no iPhone: lá a
 * notificação só funciona com o site adicionado à Tela de Início. Separar em
 * duas telas faria a pessoa ligar a chave, não receber nada e nunca descobrir
 * por quê. Por isso instalar vem primeiro, e o aviso de push aponta pra ele.
 *
 * Sem toast: o launcher não tem um, e num painel de configuração a mensagem
 * ao lado do controle é melhor mesmo — fica na tela até a pessoa resolver.
 */
export function CelularTab() {
  const { token } = useAuth()
  const estadoInstalacao = useInstallState()

  const [suporte] = React.useState<PushSupport>(() => detectPushSupport())
  const [permissao, setPermissao] = React.useState<NotificationPermission | null>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : null
  )
  /** null = ainda perguntando ao service worker. */
  const [ligado, setLigado] = React.useState<boolean | null>(null)
  const [ocupado, setOcupado] = React.useState(false)
  const [testando, setTestando] = React.useState(false)
  const [semChave, setSemChave] = React.useState(false)
  const [aparelhos, setAparelhos] = React.useState<PushDevice[]>([])
  const [recado, setRecado] = React.useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null)

  const carregarAparelhos = React.useCallback(async () => {
    if (!token) return
    try {
      const { devices, configured } = await listDevices(token)
      setAparelhos(devices)
      if (!configured) setSemChave(true)
    } catch {
      // Sem rede a lista fica vazia; o resto da aba continua funcionando.
    }
  }, [token])

  React.useEffect(() => {
    if (suporte !== 'ok') {
      setLigado(false)
      return
    }
    getCurrentSubscription()
      .then((s) => setLigado(!!s))
      .catch(() => setLigado(false))
    void carregarAparelhos()
  }, [suporte, carregarAparelhos])

  const instalar = async (): Promise<void> => {
    const resultado = await promptInstall()
    if (resultado === 'unavailable') {
      setRecado({ tom: 'erro', texto: 'O navegador não abriu o convite. Use o menu ⋮ → Instalar aplicativo.' })
    }
    // 'dismissed' é a pessoa dizendo não — não precisa de aviso nenhum.
  }

  const alternarPush = async (queroLigar: boolean): Promise<void> => {
    if (!token) return
    setOcupado(true)
    setRecado(null)
    try {
      if (queroLigar) {
        await subscribeToPush(token)
        setLigado(true)
        setSemChave(false)
        setRecado({ tom: 'ok', texto: 'Pronto. Menção e DM chegam aqui quando você não estiver com o app aberto.' })
      } else {
        await unsubscribeFromPush(token)
        setLigado(false)
        setRecado({ tom: 'ok', texto: 'Este aparelho não recebe mais avisos.' })
      }
      setPermissao(typeof Notification !== 'undefined' ? Notification.permission : null)
      void carregarAparelhos()
    } catch (erro) {
      setPermissao(typeof Notification !== 'undefined' ? Notification.permission : null)
      if (erro instanceof PushNotConfiguredError) {
        setSemChave(true)
        setRecado({ tom: 'erro', texto: 'O servidor ainda não tem as chaves de push. Cobra o admin.' })
      } else if (erro instanceof Error && erro.message === 'permissão negada') {
        setRecado({
          tom: 'erro',
          texto: 'Permissão negada. Libera notificação pro site nas configurações do navegador e tenta de novo.',
        })
      } else {
        setRecado({ tom: 'erro', texto: erro instanceof Error ? erro.message : 'Não deu. Tenta de novo daqui a pouco.' })
      }
    } finally {
      setOcupado(false)
    }
  }

  const testar = async (): Promise<void> => {
    if (!token) return
    setTestando(true)
    try {
      await sendTestPush(token)
      setRecado({ tom: 'ok', texto: 'Teste enviado. Se não apareceu, confere a permissão de notificação.' })
    } catch (erro) {
      if (erro instanceof PushNotConfiguredError) setSemChave(true)
      setRecado({ tom: 'erro', texto: erro instanceof Error ? erro.message : 'O teste falhou.' })
    } finally {
      setTestando(false)
    }
  }

  const podeAlternar = suporte === 'ok' && ligado !== null && !ocupado && permissao !== 'denied'

  return (
    <div className="space-y-5">
      <section>
        <SecTitle>Instalar no celular</SecTitle>

        {estadoInstalacao === 'installed' && (
          <Aviso icone={<CheckCircle2 className="h-4 w-4 text-acid-text" />} tom="ok">
            <strong className="font-medium text-foreground">Já está instalado.</strong> Você abriu pelo
            ícone, não pelo navegador — é assim que a notificação funciona e o app ocupa a tela toda.
          </Aviso>
        )}

        {estadoInstalacao === 'prompt-ready' && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Instala o Bocas como app: ícone na tela inicial, tela cheia e notificação de menção e DM.
            </p>
            <Button onClick={() => void instalar()} className="w-full">
              <Download className="mr-2 h-4 w-4" />
              Instalar agora
            </Button>
          </div>
        )}

        {estadoInstalacao === 'ios-manual' && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              No iPhone a instalação é na mão — a Apple não deixa o site pedir. São dois toques:
            </p>
            <ol className="space-y-2 text-sm text-foreground">
              <li className="flex gap-2">
                <Passo>1</Passo>
                <span className="pt-0.5 text-muted-foreground">
                  Toque em <Share className="-mt-0.5 mx-0.5 inline h-4 w-4 text-acid-text" />
                  <span className="text-foreground">Compartilhar</span>, na barra de baixo do Safari.
                </span>
              </li>
              <li className="flex gap-2">
                <Passo>2</Passo>
                <span className="pt-0.5 text-muted-foreground">
                  Desce a lista e escolhe{' '}
                  <SquarePlus className="-mt-0.5 mx-0.5 inline h-4 w-4 text-acid-text" />
                  <span className="text-foreground">Adicionar à Tela de Início</span>.
                </span>
              </li>
            </ol>
            <Aviso icone={<Info className="h-4 w-4 text-acid-text" />} tom="ok">
              Depois abre o Bocas pelo ícone novo. <strong className="font-medium text-foreground">
              Notificação no iPhone só funciona por ali</strong> — pelo Safari normal o sistema nem
              deixa pedir permissão.
            </Aviso>
          </div>
        )}

        {estadoInstalacao === 'manual' && (
          <Aviso icone={<MoreVertical className="h-4 w-4 text-acid-text" />} tom="ok">
            Dá pra instalar como app pelo menu do navegador:{' '}
            <span className="text-foreground">Instalar aplicativo</span> (ou "Adicionar à tela de
            início"). No computador costuma ter um ícone na própria barra de endereço.
          </Aviso>
        )}

        {estadoInstalacao === 'unsupported' && (
          <Aviso icone={<AlertTriangle className="h-4 w-4 text-burn" />} tom="erro">
            Este navegador não instala o Bocas como app. No Android use o Chrome; no iPhone, o Safari.
          </Aviso>
        )}
      </section>

      <section>
        <SecTitle>Notificações</SecTitle>

        {suporte === 'ios-needs-install' && (
          <Aviso icone={<AlertTriangle className="h-4 w-4 text-burn" />} tom="erro">
            No iPhone precisa instalar primeiro (ali em cima). O Safari só libera notificação pra app
            que está na Tela de Início, do iOS 16.4 pra frente.
          </Aviso>
        )}

        {suporte === 'unsupported' && (
          <Aviso icone={<AlertTriangle className="h-4 w-4 text-burn" />} tom="erro">
            Este navegador não tem notificação push. Tenta no Chrome (Android) ou no Safari instalado
            como app (iPhone).
          </Aviso>
        )}

        {suporte === 'insecure' && (
          <Aviso icone={<AlertTriangle className="h-4 w-4 text-burn" />} tom="erro">
            Push só funciona em HTTPS. Abre o site pelo endereço oficial.
          </Aviso>
        )}

        {semChave && (
          <Aviso icone={<AlertTriangle className="h-4 w-4 text-burn" />} tom="erro">
            O servidor ainda não está configurado pra mandar push. Quando o admin colocar as chaves, é
            só voltar aqui e ativar.
          </Aviso>
        )}

        <SwitchRow
          label={ligado ? 'Ativado neste aparelho' : 'Ativar neste aparelho'}
          hint={
            ligado
              ? 'Menção, DM e lembrete chegam mesmo com o app fechado.'
              : `Permissão do navegador: ${
                  permissao === 'granted' ? 'permitida' : permissao === 'denied' ? 'bloqueada' : 'ainda não pedida'
                }`
          }
          checked={!!ligado}
          disabled={!podeAlternar}
          onCheckedChange={(valor) => void alternarPush(valor)}
        />

        {permissao === 'denied' && suporte === 'ok' && (
          <p className="mt-1 text-xs text-burn">
            Você bloqueou notificação pra este site. Libera nas configurações do navegador (cadeado na
            barra de endereço) e recarrega.
          </p>
        )}

        {recado && (
          <p className={`mt-2 text-xs ${recado.tom === 'erro' ? 'text-burn' : 'text-muted-foreground'}`}>
            {recado.texto}
          </p>
        )}

        <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            {aparelhos.length === 0
              ? 'Nenhum aparelho cadastrado ainda.'
              : `${aparelhos.length} ${aparelhos.length === 1 ? 'aparelho cadastrado' : 'aparelhos cadastrados'}: ${aparelhos
                  .map((a) => descreverAparelho(a.userAgent))
                  .join(', ')}`}
          </p>
          {ligado && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void testar()}
              disabled={testando || semChave}
              className="shrink-0"
            >
              {testando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BellRing className="mr-2 h-4 w-4" />}
              Testar
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}

// ============================================
// MIUDEZAS
// ============================================

/**
 * Cópia proposital do `SectionTitle` do SettingsModal.
 *
 * Importar de lá criaria import CIRCULAR — o SettingsModal importa esta aba.
 * Cinco linhas duplicadas custam menos que um ciclo de módulos, que no Vite
 * falha em runtime com um `undefined` no meio da árvore, não no build.
 *
 * Mono + caixa-alta + tracking em `h3` é rótulo de SEÇÃO pelo design system;
 * em `<p>`/`<span>` o `lint:design` reprova, e com razão — ali o trio vira
 * "observação", que é Inter em caixa normal.
 */
function SecTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground">
      {children}
    </h3>
  )
}

function Passo({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-acid/15 text-[11px] font-bold text-acid-text">
      {children}
    </span>
  )
}

function Aviso({
  children,
  icone,
  tom,
}: {
  children: React.ReactNode
  icone: React.ReactNode
  tom: 'ok' | 'erro'
}) {
  return (
    <div
      className={`mt-2 flex gap-2 rounded-brutal border p-2.5 text-xs leading-snug ${
        tom === 'erro' ? 'border-burn/40 bg-burn/10 text-muted-foreground' : 'border-line bg-surface-raised text-muted-foreground'
      }`}
    >
      <span className="mt-0.5 shrink-0">{icone}</span>
      <span className="min-w-0">{children}</span>
    </div>
  )
}

/** "Android · Chrome", "iPhone · Safari": só pra pessoa reconhecer o aparelho. */
function descreverAparelho(ua: string | null): string {
  if (!ua) return 'Aparelho'
  const so = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Aparelho'
  const navegador = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : ''
  return navegador ? `${so} · ${navegador}` : so
}
