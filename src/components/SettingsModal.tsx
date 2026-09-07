import * as React from 'react'
import {
  MemoryStick,
  RotateCcw,
  Mic,
  Keyboard,
  Zap,
  Gamepad2,
  MessagesSquare,
  Loader2,
  TriangleAlert,
  Power,
  Swords,
  Headphones,
  RefreshCw,
  Sparkles
} from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { useHotkeys } from '@/lib/hotkeys-context'
import { useNudge } from '@/lib/nudge-context'
import { useOverlays } from '@/lib/overlay-context'
import { useUpdater } from '@/lib/updater-context'
import { useVoice } from '@/lib/voice-context'
import { useAudioDevices, useVideoDevices } from '@/lib/use-audio-devices'
import { playUiSound } from '@/lib/ui-sounds'
import { GATE_OFF_DB } from '@/lib/audio-processor'
import { RAM_LIMITS, type LolPhase, type LolStatus } from '../../electron/preload/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SwitchRow } from '@/components/ui/switch'
import { HotkeyRecorder, formatAccelerator } from '@/components/social/HotkeyRecorder'
import { MicMeter } from '@/components/social/MicMeter'

const DEFAULT_MAX_MB = 4096

function formatMb(mb: number): string {
  if (mb < 1024) return `${mb} MB`
  const gb = mb / 1024
  return Number.isInteger(gb) ? `${gb} GB` : `${gb.toFixed(1)} GB`
}

/**
 * Configurações do launcher.
 *
 * Tudo aqui salva na hora (não tem botão "Salvar"): mexer no volume ou trocar
 * de microfone só faz sentido se o efeito for imediato pra pessoa conferir. A
 * exceção é a RAM, que só vale no próximo launch do jogo e por isso tem aviso.
 */
export function SettingsModal() {
  const { settings, isOpen, close, update } = useSettings()

  return (
    <Dialog open={isOpen} onOpenChange={(next) => !next && close()}>
      <DialogContent className="h-[80vh] max-w-2xl">
        <DialogHeader>
          <DialogTitle>Configurações</DialogTitle>
          <DialogDescription>salva automaticamente</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="voz" className="flex min-h-0 flex-1 flex-col">
          {/* flex-wrap: sete abas cabem numa linha na largura normal, mas a
              janela mínima é apertada e uma aba caindo pra linha de baixo é
              melhor que uma aba cortada. */}
          <TabsList className="flex-wrap">
            <TabsTrigger value="voz">
              <Mic className="mr-1.5 inline h-3 w-3" />
              Voz
            </TabsTrigger>
            <TabsTrigger value="chat">
              <MessagesSquare className="mr-1.5 inline h-3 w-3" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="atalhos">
              <Keyboard className="mr-1.5 inline h-3 w-3" />
              Atalhos
            </TabsTrigger>
            <TabsTrigger value="zoeira">
              <Zap className="mr-1.5 inline h-3 w-3" />
              Zoeira
            </TabsTrigger>
            <TabsTrigger value="jogo">
              <Gamepad2 className="mr-1.5 inline h-3 w-3" />
              Jogo
            </TabsTrigger>
            <TabsTrigger value="inicio">
              <Power className="mr-1.5 inline h-3 w-3" />
              Início
            </TabsTrigger>
            <TabsTrigger value="lol">
              <Swords className="mr-1.5 inline h-3 w-3" />
              LoL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="voz">
            <VoiceTab />
          </TabsContent>
          <TabsContent value="chat">
            <ChatTab />
          </TabsContent>
          <TabsContent value="atalhos">
            <HotkeysTab />
          </TabsContent>
          <TabsContent value="zoeira">
            <ZoeiraTab />
          </TabsContent>
          <TabsContent value="jogo">
            <GameTab settings={settings} update={update} />
          </TabsContent>
          <TabsContent value="inicio">
            <StartupTab />
          </TabsContent>
          <TabsContent value="lol">
            <LolTab />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// ============================================
// CHAT
// ============================================

function ChatTab() {
  const { settings, update } = useSettings()
  const chat = settings.chat

  const patch = (part: Partial<typeof chat>): void => {
    void update({ chat: { ...chat, ...part } })
  }

  return (
    <div className="space-y-5">
      <section>
        <SectionTitle>Exibição</SectionTitle>
        <SwitchRow
          label="Modo compacto"
          hint="Uma linha por mensagem, sem avatar grande. Cabe muito mais conversa na tela."
          checked={chat.compact}
          onCheckedChange={(compact) => patch({ compact })}
        />
        <SwitchRow
          label="Prévia de links"
          hint="Cartão com miniatura embaixo de links de YouTube e imagem."
          checked={chat.showEmbeds}
          onCheckedChange={(showEmbeds) => patch({ showEmbeds })}
        />
      </section>

      <section>
        <SectionTitle>Avisos</SectionTitle>
        <SwitchRow
          label="Som de mensagem"
          hint="Bipe curto quando chega mensagem; um pouco mais alto quando citam você."
          checked={chat.messageSound}
          onCheckedChange={(messageSound) => patch({ messageSound })}
        />
        <SwitchRow
          label="Notificar quando me citarem"
          hint="Balão do Windows quando alguém escreve @seunome (ou @todos)."
          checked={chat.notifyOnMention}
          onCheckedChange={(notifyOnMention) => patch({ notifyOnMention })}
        />
        <SwitchRow
          label="Notificar toda mensagem"
          hint="Balão em QUALQUER mensagem nova. Em grupo tagarela isso vira spam — deixe desligado se não for pra trabalho."
          checked={chat.notifyAllMessages}
          onCheckedChange={(notifyAllMessages) => patch({ notifyAllMessages })}
        />

        <label className="mt-3 flex items-center gap-3">
          <span className="shrink-0 text-sm">Volume de entrar/sair da call</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.voiceCueVolume}
            onChange={(e) => void update({ voiceCueVolume: Number(e.target.value) })}
            onMouseUp={() =>
              playUiSound('voice-join', settings.soundEnabled ? settings.voiceCueVolume : 0)
            }
            className="ram-slider flex-1"
          />
          <span className="w-9 shrink-0 text-right font-mono text-[11px] text-acid">
            {Math.round(settings.voiceCueVolume * 100)}%
          </span>
        </label>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          O som que toca pra todo mundo na sala quando alguém entra ou sai. Solte
          o controle pra ouvir uma prévia.
        </p>

        <p className="mt-3 rounded-brutal border border-[#1a1a1a] bg-void/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          Pra silenciar UM canal só, clique no sininho no topo dele. Canal
          silenciado não conta não-lidas nem avisa — mas menção direta a você
          continua passando.
        </p>

        {chat.mutedChannels.length > 0 && (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {chat.mutedChannels.length}{' '}
            {chat.mutedChannels.length === 1 ? 'canal silenciado' : 'canais silenciados'}
          </p>
        )}
      </section>
    </div>
  )
}

// ============================================
// VOZ
// ============================================

function VoiceTab() {
  const { settings, update, isOpen } = useSettings()
  const { inputs, outputs, loading, error } = useAudioDevices(isOpen)
  const camera = useVideoDevices(isOpen)
  const voice = settings.voice

  const patch = (changes: Partial<typeof voice>): void => {
    void update({ voice: { ...voice, ...changes } })
  }

  return (
    <div className="space-y-5 pr-1">
      <section className="space-y-2">
        <SectionTitle>Dispositivos</SectionTitle>

        {loading && (
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            procurando…
          </p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}

        <DeviceSelect
          label="Microfone"
          value={voice.inputDeviceId}
          devices={inputs}
          onChange={(deviceId) => patch({ inputDeviceId: deviceId })}
        />
        <DeviceSelect
          label="Saída de som"
          value={voice.outputDeviceId}
          devices={outputs}
          onChange={(deviceId) => patch({ outputDeviceId: deviceId })}
        />

        <DeviceSelect
          label="Câmera"
          value={voice.cameraDeviceId}
          devices={camera.cameras}
          onChange={(deviceId) => patch({ cameraDeviceId: deviceId })}
        />

        {camera.error && <p className="text-xs text-destructive">{camera.error}</p>}

        {/*
          Nome de câmera só aparece depois que a página teve permissão de
          câmera, e pedir isso ACENDE O LED — não é coisa pra fazer sozinho
          quando alguém abre as configurações. O botão existe e a pessoa
          decide. Quem já ligou a câmera numa call vê os nomes sem isto.
        */}
        {camera.needsPermission && (
          <button
            type="button"
            onClick={() => void camera.reveal()}
            disabled={camera.loading}
            className="flex items-center gap-1.5 rounded-brutal border-2 border-[#1a1a1a] px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-acid/50 hover:text-acid disabled:opacity-50"
          >
            {camera.loading && <Loader2 className="h-3 w-3 animate-spin" />}
            ver o nome das câmeras (acende o LED por um instante)
          </button>
        )}

        <label className="flex items-center justify-between gap-3 pt-1">
          <span className="min-w-0 flex-1">
            <span className="block text-sm">Volume da call</span>
            <span className="block text-[10px] text-muted-foreground">
              Vale pra todo mundo. Pra ajustar uma pessoa só, use o slider no card dela.
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={voice.outputVolume}
            onChange={(e) => patch({ outputVolume: Number(e.target.value) })}
            className="ram-slider w-28 shrink-0"
          />
          <span className="w-8 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
            {Math.round(voice.outputVolume * 100)}
          </span>
        </label>
      </section>

      <MicProcessingSection
        inputGain={voice.inputGain}
        threshold={voice.noiseGateThreshold}
        onGain={(inputGain) => patch({ inputGain })}
        onThreshold={(noiseGateThreshold) => patch({ noiseGateThreshold })}
      />

      <section className="space-y-2">
        <SectionTitle>Modo de transmissão</SectionTitle>

        <div className="flex gap-1">
          <ModeButton
            active={voice.mode === 'voice-activity'}
            onClick={() => patch({ mode: 'voice-activity' })}
          >
            Voz ativa
          </ModeButton>
          <ModeButton
            active={voice.mode === 'push-to-talk'}
            onClick={() => patch({ mode: 'push-to-talk' })}
          >
            Apertar pra falar
          </ModeButton>
        </div>

        {voice.mode === 'push-to-talk' && (
          <label className="flex items-center justify-between gap-3 pt-1">
            <span className="text-sm">Tecla (com a janela em foco)</span>
            <PttKeyPicker
              value={voice.pttKey}
              onChange={(pttKey) => patch({ pttKey })}
            />
          </label>
        )}
      </section>

      <section>
        <SectionTitle>Processamento</SectionTitle>
        <SwitchRow
          label="Cancelamento de eco"
          hint="Evita que o som da caixa volte pro microfone."
          checked={voice.echoCancellation}
          onCheckedChange={(echoCancellation) => patch({ echoCancellation })}
        />
        <SwitchRow
          label="Redução de ruído"
          hint="Corta ventilador, teclado e ar-condicionado."
          checked={voice.noiseSuppression}
          onCheckedChange={(noiseSuppression) => patch({ noiseSuppression })}
        />
        <SwitchRow
          label="Cortar ruído grave"
          hint="Mesa batendo, cadeira rangendo e o resto: o microfone só abre quando o som tem cara de voz, não de estouro grave. Vale na hora. Desligue se a sua voz estiver sendo cortada."
          checked={voice.rumbleFilter}
          onCheckedChange={(rumbleFilter) => patch({ rumbleFilter })}
        />
        <SwitchRow
          label="Ganho automático"
          hint="Nivela o volume da voz. Alguns microfones ficam melhor com isso desligado."
          checked={voice.autoGainControl}
          onCheckedChange={(autoGainControl) => patch({ autoGainControl })}
        />
        <p className="pt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          vale na próxima vez que entrar na call
        </p>
      </section>
    </div>
  )
}

/**
 * Ganho, noise gate, medidor e teste — o pedaço da aba que fala com o
 * processador do mic.
 *
 * Componente separado pra ser o ÚNICO aqui dentro que chama useVoice(): o
 * contexto de voz muda a cada troca de quem está falando, e o resto da aba
 * (dispositivos, PTT, filtros) não tem por que re-renderizar junto.
 */
function MicProcessingSection({
  inputGain,
  threshold,
  onGain,
  onThreshold
}: {
  inputGain: number
  threshold: number
  onGain: (value: number) => void
  onThreshold: (value: number) => void
}) {
  const { getMicLevel, isMicGateOpen, holdMicMonitor, micTest, connected } = useVoice()

  // O objeto micTest troca quando `active` muda; a limpeza quer sempre o stop
  // mais recente, sem reexecutar o efeito a cada toggle.
  const micTestRef = React.useRef(micTest)
  micTestRef.current = micTest

  // Enquanto esta seção está na tela, o mic fica aberto pro medidor. Sair da
  // aba solta o mic e desliga o teste — ninguém quer se ouvir no loopback
  // depois de fechar as configurações.
  React.useEffect(() => {
    const release = holdMicMonitor()
    return () => {
      release()
      micTestRef.current.stop()
    }
  }, [holdMicMonitor])

  const gateOn = threshold > GATE_OFF_DB

  return (
    <section className="space-y-3">
      <SectionTitle>Microfone</SectionTitle>

      <LiveSlider
        label="Ganho do microfone"
        hint="Sobe ou desce o que sai do mic antes de tudo. 100% = como ele veio."
        min={0.5}
        max={3}
        step={0.05}
        value={inputGain}
        format={(v) => `${Math.round(v * 100)}%`}
        onCommit={onGain}
      />

      <LiveSlider
        label="Noise gate"
        hint="Abaixo desse nível o mic fecha. Todo à esquerda = desligado."
        min={GATE_OFF_DB}
        max={-20}
        step={1}
        value={threshold}
        format={(v) => (v <= GATE_OFF_DB ? 'desligado' : `${v} dB`)}
        onCommit={onThreshold}
      />

      <div className="space-y-1.5">
        <MicMeter getLevel={getMicLevel} isOpen={isMicGateOpen} threshold={threshold} />
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 flex-1 text-[10px] leading-snug text-muted-foreground">
            {gateOn
              ? 'Fale normal: a barra deve passar do marcador amarelo. Em silêncio, ela tem que ficar cinza — se ficar verde, suba o limiar.'
              : 'Verde = transmitindo. Ligue o gate pra cortar ventilador e teclado quando você não está falando.'}
          </p>
          <Button
            size="sm"
            variant={micTest.active ? 'default' : 'outline'}
            onClick={() => (micTest.active ? micTest.stop() : micTest.start())}
            className="shrink-0"
          >
            <Headphones className="mr-1.5 h-3.5 w-3.5" />
            {micTest.active ? 'Parar teste' : 'Testar microfone'}
          </Button>
        </div>
        {micTest.active && (
          <p className="font-mono text-[10px] uppercase tracking-widest text-acid">
            você está se ouvindo{connected ? ' — a call não ouve o teste' : ''}
          </p>
        )}
      </div>
    </section>
  )
}

/**
 * Slider que anda com o dedo e grava com atraso.
 *
 * Cada `update` das configurações é um read-modify-write no settings.json via
 * IPC; arrastar dispara um onChange por pixel, e dois em paralelo se
 * atropelam. O valor local muda na hora, o disco (e o processador do mic, que
 * lê das configurações) recebe ~8 vezes por segundo — rápido o bastante pra
 * ajustar olhando o medidor.
 */
function LiveSlider({
  label,
  hint,
  min,
  max,
  step,
  value,
  format,
  onCommit
}: {
  label: string
  hint?: string
  min: number
  max: number
  step: number
  value: number
  format: (value: number) => string
  onCommit: (value: number) => void
}) {
  const [local, setLocal] = React.useState(value)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = React.useRef<number | null>(null)

  React.useEffect(() => setLocal(value), [value])

  const commit = React.useCallback(() => {
    timerRef.current = null
    if (pendingRef.current === null) return
    const next = pendingRef.current
    pendingRef.current = null
    onCommit(next)
  }, [onCommit])

  const change = (next: number): void => {
    setLocal(next)
    pendingRef.current = next
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(commit, 120)
  }

  // Fechar a aba no meio do arrasto não pode perder o ajuste.
  React.useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        commit()
      }
    }
  }, [commit])

  return (
    <label className="flex items-center justify-between gap-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-[10px] text-muted-foreground">{hint}</span>}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={local}
        onChange={(e) => change(Number(e.target.value))}
        className="ram-slider w-28 shrink-0"
      />
      <span className="w-16 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
        {format(local)}
      </span>
    </label>
  )
}

function DeviceSelect({
  label,
  value,
  devices,
  onChange
}: {
  label: string
  value: string
  devices: Array<{ deviceId: string; label: string }>
  onChange: (deviceId: string) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-sm">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-terminal h-8 min-w-0 max-w-[60%] flex-1 rounded-brutal px-2 text-xs"
      >
        <option value="default">Padrão do sistema</option>
        {devices
          .filter((device) => device.deviceId !== 'default')
          .map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
      </select>
    </label>
  )
}

/** Captura uma tecla simples (sem modificadores) pro PTT em foco. */
function PttKeyPicker({
  value,
  onChange
}: {
  value: string
  onChange: (code: string) => void
}) {
  const [recording, setRecording] = React.useState(false)

  React.useEffect(() => {
    if (!recording) return

    const handler = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      setRecording(false)
      if (e.code !== 'Escape') onChange(e.code)
    }

    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [recording, onChange])

  return (
    <button
      type="button"
      onClick={() => setRecording((prev) => !prev)}
      className={`h-8 min-w-[7rem] rounded-brutal border-2 px-2 font-mono text-[11px] uppercase tracking-wider transition-colors ${
        recording
          ? 'border-acid bg-acid/10 text-acid'
          : 'border-[#1a1a1a] text-foreground hover:border-acid/50'
      }`}
    >
      {recording ? 'Aperte…' : value.replace(/^Key|^Digit/, '')}
    </button>
  )
}

// ============================================
// ATALHOS
// ============================================

function HotkeysTab() {
  const { settings, update } = useSettings()
  const { registrations } = useHotkeys()
  const hotkeys = settings.hotkeys

  const patch = (changes: Partial<typeof hotkeys>): void => {
    void update({ hotkeys: { ...hotkeys, ...changes } })
  }

  const failed = registrations.filter((r) => !r.ok)

  return (
    <div className="space-y-5 pr-1">
      <p className="rounded-brutal border border-[#1a1a1a] bg-void/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        Atalhos globais funcionam com o launcher em segundo plano — dá pra soltar
        um som sem sair do jogo.
      </p>

      {failed.length > 0 && (
        <div className="space-y-1 rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <TriangleAlert className="h-3.5 w-3.5" />
            Atalhos que não puderam ser registrados
          </p>
          {failed.map((registration) => (
            <p key={registration.id} className="font-mono text-[10px] text-destructive/80">
              {formatAccelerator(registration.accelerator)} — {registration.error}
            </p>
          ))}
        </div>
      )}

      <section className="space-y-3">
        <SectionTitle>Chamada</SectionTitle>

        <HotkeyRow
          label="Silenciar / reativar microfone"
          value={hotkeys.mute}
          onChange={(mute) => patch({ mute })}
        />
        <HotkeyRow
          label="Ensurdecer"
          value={hotkeys.deafen}
          onChange={(deafen) => patch({ deafen })}
        />
        <HotkeyRow
          label="Alternar microfone (global)"
          hint="Fora da janela, o Windows não avisa quando a tecla é solta — então o atalho global alterna em vez de segurar."
          value={hotkeys.pttToggle}
          onChange={(pttToggle) => patch({ pttToggle })}
        />
      </section>

      <section className="space-y-3">
        <SectionTitle>Zoeira</SectionTitle>
        <HotkeyRow
          label="Tremer a tela da sala"
          hint="Uma vez por minuto, por pessoa."
          value={hotkeys.nudgeChannel}
          onChange={(nudgeChannel) => patch({ nudgeChannel })}
        />
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          atalho de cada som fica no painel do soundboard
        </p>
      </section>
    </div>
  )
}

function HotkeyRow({
  label,
  hint,
  value,
  onChange
}: {
  label: string
  hint?: string
  value: string
  onChange: (accelerator: string) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {hint && (
          <span className="block text-xs leading-snug text-muted-foreground">{hint}</span>
        )}
      </span>
      <HotkeyRecorder value={value} onChange={onChange} className="shrink-0" />
    </div>
  )
}

// ============================================
// ZOEIRA
// ============================================

function ZoeiraTab() {
  const { settings, update } = useSettings()
  const { testShake } = useNudge()

  return (
    <div className="space-y-5 pr-1">
      <section>
        <SectionTitle>Cutucar (tremer a tela)</SectionTitle>

        <SwitchRow
          label="Aceitar cutucadas"
          hint="Desligado, ninguém consegue tremer a sua tela."
          checked={!settings.nudgeOptOut}
          onCheckedChange={(accept) => void update({ nudgeOptOut: !accept })}
        />
        <SwitchRow
          label="Sacudir a janela de verdade"
          hint="Além do conteúdo, a janela pula na tela. Não vale quando ela está maximizada."
          checked={settings.nudgeShakeWindow}
          disabled={settings.nudgeOptOut}
          onCheckedChange={(nudgeShakeWindow) => void update({ nudgeShakeWindow })}
        />

        <Button size="sm" variant="outline" className="mt-2" onClick={testShake}>
          Testar tremor
        </Button>

        <p className="mt-3 rounded-brutal border border-[#1a1a1a] bg-void/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          Limites do servidor: 15s entre cutucadas na mesma pessoa, 3 por minuto
          por quem envia, e no máximo 5 por minuto em quem recebe — mesmo que
          venham de gente diferente.
        </p>
      </section>

      <section className="space-y-2">
        <SectionTitle>Soundboard</SectionTitle>
        <label className="flex items-center gap-3">
          <span className="shrink-0 text-sm">Volume dos sons</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.soundboardVolume}
            onChange={(e) => void update({ soundboardVolume: Number(e.target.value) })}
            className="ram-slider flex-1"
          />
          <span className="w-9 shrink-0 text-right font-mono text-[11px] text-acid">
            {Math.round(settings.soundboardVolume * 100)}%
          </span>
        </label>
        <p className="rounded-brutal border border-[#1a1a1a] bg-void/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          Limites do servidor: 1,5s entre sons, 4 por pessoa a cada 20s e 8 no
          canal inteiro no mesmo período.
        </p>
      </section>
    </div>
  )
}

// ============================================
// JOGO
// ============================================

function GameTab({
  settings,
  update
}: {
  settings: import('../../electron/preload/types').LauncherSettings
  update: (patch: Partial<import('../../electron/preload/types').LauncherSettings>) => Promise<void>
}) {
  const [maxRamMb, setMaxRamMb] = React.useState(settings.maxRamMb)

  React.useEffect(() => setMaxRamMb(settings.maxRamMb), [settings.maxRamMb])

  return (
    <div className="space-y-5 pr-1">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <SectionTitle>
            <MemoryStick className="mr-1 inline h-3 w-3" />
            RAM máxima
          </SectionTitle>
          <button
            onClick={() => {
              setMaxRamMb(DEFAULT_MAX_MB)
              void update({ maxRamMb: DEFAULT_MAX_MB })
            }}
            className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-acid"
          >
            <RotateCcw className="h-3 w-3" />
            Padrão
          </button>
        </div>

        <input
          type="range"
          min={RAM_LIMITS.min}
          max={RAM_LIMITS.max}
          step={RAM_LIMITS.step}
          value={maxRamMb}
          onChange={(e) => setMaxRamMb(Number(e.target.value))}
          onMouseUp={() => void update({ maxRamMb })}
          onKeyUp={() => void update({ maxRamMb })}
          className="ram-slider w-full"
          aria-label="RAM máxima"
        />

        <div className="mt-2 flex items-end justify-between">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {formatMb(RAM_LIMITS.min)}
          </span>
          <span className="font-display text-3xl uppercase tracking-tight text-acid drop-shadow-[0_0_8px_rgba(106,255,0,0.4)]">
            {formatMb(maxRamMb)}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {formatMb(RAM_LIMITS.max)}
          </span>
        </div>

        <p className="mt-3 rounded-brutal border border-[#1a1a1a] bg-void/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          Vale no próximo launch. Não passa de ~50–75% da RAM total do PC.
        </p>
      </section>

      <section>
        <SectionTitle>Geral</SectionTitle>
        <SwitchRow
          label="Notificar entrada/saída no servidor"
          hint="Avisa quando alguém entra ou sai do servidor de Minecraft."
          checked={settings.notifyOnJoinLeave}
          onCheckedChange={(notifyOnJoinLeave) => void update({ notifyOnJoinLeave })}
        />
        <SwitchRow
          label="Mostrar Minecraft como atividade"
          hint="Enquanto o jogo estiver aberto, a galera vê “jogando Minecraft” do lado do seu nome."
          checked={settings.shareMinecraftActivity}
          onCheckedChange={(shareMinecraftActivity) => void update({ shareMinecraftActivity })}
        />
        <SwitchRow
          label="Efeitos sonoros da interface"
          checked={settings.soundEnabled}
          onCheckedChange={(soundEnabled) => void update({ soundEnabled })}
        />
        <p className="pt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          fechar pra bandeja e iniciar com o windows ficam na aba início
        </p>
      </section>
    </div>
  )
}

// ============================================
// INÍCIO (Windows, bandeja)
// ============================================

function StartupTab() {
  const { settings, update } = useSettings()
  const { openWhatsNew } = useOverlays()
  const { close: closeSettings } = useSettings()
  const { status } = useUpdater()
  const [autostart, setAutostart] = React.useState<{ enabled: boolean; supported: boolean } | null>(
    null
  )

  // Consulta na entrada: além de mostrar o estado real, é aqui que a pessoa
  // descobre que em build de desenvolvimento o Windows não registra nada.
  React.useEffect(() => {
    void window.bocas.app.applyAutostart().then(setAutostart).catch(() => {})
  }, [])

  const toggleAutostart = async (value: boolean): Promise<void> => {
    await update({ autostart: value })
    // A preferência já está gravada; isto registra (ou tira) do Windows agora,
    // não só no próximo boot do launcher.
    setAutostart(await window.bocas.app.applyAutostart().catch(() => null))
  }

  const unsupported = autostart !== null && !autostart.supported

  return (
    <div className="space-y-5 pr-1">
      <section>
        <SectionTitle>Windows</SectionTitle>
        <SwitchRow
          label="Iniciar com o Windows"
          hint="O launcher abre sozinho quando você loga. É o jeito de estar online quando a galera aparecer."
          checked={settings.autostart}
          onCheckedChange={(value) => void toggleAutostart(value)}
        />
        <SwitchRow
          label="Abrir direto na bandeja"
          hint="Ao iniciar com o Windows, fica só o ícone perto do relógio — sem janela na cara."
          checked={settings.startMinimized}
          disabled={!settings.autostart}
          onCheckedChange={(startMinimized) => void update({ startMinimized })}
        />

        {unsupported && (
          <p className="mt-2 flex items-start gap-1.5 rounded-brutal border border-burn/50 bg-burn/10 px-3 py-2 text-xs leading-relaxed text-burn">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Build de desenvolvimento: o Windows só aceita registrar o launcher
            instalado. A preferência fica salva e vale no app empacotado.
          </p>
        )}
        {autostart?.supported && (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            registrado no windows: {autostart.enabled ? 'sim' : 'não'}
          </p>
        )}
      </section>

      <section>
        <SectionTitle>Bandeja</SectionTitle>
        <SwitchRow
          label="Fechar pra bandeja"
          hint="Fechar a janela mantém você na chamada. Pra sair de vez, use o menu da bandeja."
          checked={settings.closeToTray}
          onCheckedChange={(closeToTray) => void update({ closeToTray })}
        />
      </section>

      <section>
        <SectionTitle>Versão</SectionTitle>
        {/* O launcher se atualiza sozinho, inclusive com a janela escondida na
            bandeja: a camada de novidades abre uma vez por versão nova, e
            quem fechou sem ler (ou quer reler) volta por aqui. */}
        <div className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="text-sm text-foreground">Novidades desta versão</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              O que mudou na v{status.currentVersion ?? '—'}, que é a que você
              está usando.
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0"
            onClick={() => {
              closeSettings()
              openWhatsNew()
            }}
          >
            <Sparkles className="mr-1.5 h-3 w-3" />
            Ver
          </Button>
        </div>
      </section>
    </div>
  )
}

// ============================================
// LOL (League of Legends via cliente local)
// ============================================

const LOL_PHASE_LABEL: Record<LolPhase, string> = {
  none: 'fora de partida',
  lobby: 'no lobby',
  matchmaking: 'procurando partida',
  'ready-check': 'partida encontrada',
  'champ-select': 'seleção de campeão',
  'in-progress': 'em partida',
  'end-of-game': 'fim de jogo'
}

function LolTab() {
  const { settings, update } = useSettings()
  const lol = settings.lol

  const patch = (part: Partial<typeof lol>): void => {
    void update({ lol: { ...lol, ...part } })
  }

  const [status, setStatus] = React.useState<LolStatus | null>(null)
  const [testing, setTesting] = React.useState(false)

  React.useEffect(() => {
    void window.bocas.lol.status().then(setStatus).catch(() => {})
    return window.bocas.lol.onStatus(setStatus)
  }, [])

  const test = async (): Promise<void> => {
    setTesting(true)
    try {
      setStatus(await window.bocas.lol.refresh())
    } catch (err) {
      setStatus((prev) => ({
        clientRunning: false,
        phase: 'none',
        phaseSince: 0,
        ...prev,
        error: err instanceof Error ? err.message : 'Falha ao ler o cliente',
        updatedAt: Date.now()
      }))
    } finally {
      setTesting(false)
    }
  }

  // O caminho do lockfile grava no blur, não a cada tecla: cada tecla seria um
  // IPC + escrita em disco, e o main reagiria a cada caminho pela metade.
  const [lockfilePath, setLockfilePath] = React.useState(lol.lockfilePath)
  React.useEffect(() => setLockfilePath(lol.lockfilePath), [lol.lockfilePath])

  const commitLockfile = (): void => {
    const trimmed = lockfilePath.trim()
    if (trimmed !== lol.lockfilePath) patch({ lockfilePath: trimmed })
  }

  return (
    <div className="space-y-5 pr-1">
      <section>
        <SectionTitle>Presença</SectionTitle>
        <SwitchRow
          label="Ler o cliente do LoL"
          hint="Mostra pra galera que você está no lobby, na fila ou em partida — e com quem."
          checked={lol.enabled}
          onCheckedChange={(enabled) => patch({ enabled })}
        />
        <SwitchRow
          label="Mostrar placar ao vivo"
          hint="KDA e tempo de jogo junto da presença. Desligue se não quer plateia no 0/7."
          checked={lol.shareLiveScore}
          disabled={!lol.enabled}
          onCheckedChange={(shareLiveScore) => patch({ shareLiveScore })}
        />
        <SwitchRow
          label="Card de fim de partida no chat"
          hint="Ao acabar o jogo, posta o resultado com KDA e quem do grupo estava junto."
          checked={lol.postGameCard}
          disabled={!lol.enabled}
          onCheckedChange={(postGameCard) => patch({ postGameCard })}
        />

        <label className="flex items-center justify-between gap-3 py-2">
          <span className="min-w-0">
            <span className="block text-sm font-medium">Gente do grupo no lobby</span>
            <span className="block text-xs leading-snug text-muted-foreground">
              Quando 2+ de vocês estão no mesmo lobby e você está fora da call.
            </span>
          </span>
          <select
            value={lol.autoJoinVoice}
            disabled={!lol.enabled}
            onChange={(e) =>
              patch({ autoJoinVoice: e.target.value as typeof lol.autoJoinVoice })
            }
            className="input-terminal h-8 w-40 shrink-0 rounded-brutal px-2 text-xs disabled:opacity-50"
          >
            <option value="auto">Entrar sozinho</option>
            <option value="ask">Perguntar</option>
            <option value="off">Não fazer nada</option>
          </select>
        </label>
      </section>

      <section className="space-y-2">
        <SectionTitle>Cliente</SectionTitle>
        <label className="block">
          <span className="block text-sm">Caminho do lockfile</span>
          <span className="block text-xs leading-snug text-muted-foreground">
            Só preencha se a detecção automática falhar (instalação fora do padrão).
          </span>
          <input
            type="text"
            value={lockfilePath}
            onChange={(e) => setLockfilePath(e.target.value)}
            onBlur={commitLockfile}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            placeholder="Detectar automaticamente"
            spellCheck={false}
            className="input-terminal mt-1.5 h-8 w-full rounded-brutal px-2 font-mono text-xs"
          />
        </label>

        <div className="rounded-brutal border border-[#1a1a1a] bg-void/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Leitura do cliente
            </p>
            <Button size="sm" variant="outline" onClick={() => void test()} disabled={testing}>
              {testing ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3 w-3" />
              )}
              Testar leitura
            </Button>
          </div>

          {status ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-xs">
              <StatusRow label="Cliente">
                <span className={status.clientRunning ? 'text-acid' : 'text-muted-foreground'}>
                  {status.clientRunning ? 'aberto' : 'fechado'}
                </span>
              </StatusRow>
              <StatusRow label="Fase">{LOL_PHASE_LABEL[status.phase] ?? status.phase}</StatusRow>
              <StatusRow label="Riot ID">{status.me?.riotId ?? '—'}</StatusRow>
              <StatusRow label="Fila">{status.queue ?? '—'}</StatusRow>
              <StatusRow label="Campeão">{status.champion ?? '—'}</StatusRow>
              {status.error && (
                <StatusRow label="Erro">
                  <span className="text-destructive">{status.error}</span>
                </StatusRow>
              )}
              <StatusRow label="Lido">
                {status.updatedAt
                  ? new Date(status.updatedAt).toLocaleTimeString('pt-BR')
                  : '—'}
              </StatusRow>
            </dl>
          ) : (
            <p className="font-mono text-xs text-muted-foreground">
              Sem leitura ainda<span className="terminal-cursor" />
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

function StatusRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-foreground">{children}</dd>
    </>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
      {children}
    </h3>
  )
}

function ModeButton({
  children,
  active,
  onClick
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-brutal border-2 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
        active
          ? 'border-acid bg-acid/10 text-acid'
          : 'border-[#1a1a1a] text-muted-foreground hover:border-acid/50 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}
