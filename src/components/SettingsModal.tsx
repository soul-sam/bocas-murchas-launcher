import * as React from 'react'
import {
  MemoryStick,
  RotateCcw,
  Mic,
  Keyboard,
  Zap,
  Gamepad2,
  Loader2,
  TriangleAlert
} from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { useHotkeys } from '@/lib/hotkeys-context'
import { useNudge } from '@/lib/nudge-context'
import { useAudioDevices } from '@/lib/use-audio-devices'
import { RAM_LIMITS } from '../../electron/preload/types'
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
          <TabsList>
            <TabsTrigger value="voz">
              <Mic className="mr-1.5 inline h-3 w-3" />
              Voz
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
          </TabsList>

          <TabsContent value="voz">
            <VoiceTab />
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
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// ============================================
// VOZ
// ============================================

function VoiceTab() {
  const { settings, update, isOpen } = useSettings()
  const { inputs, outputs, loading, error } = useAudioDevices(isOpen)
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
          label="Efeitos sonoros da interface"
          checked={settings.soundEnabled}
          onCheckedChange={(soundEnabled) => void update({ soundEnabled })}
        />
        <SwitchRow
          label="Fechar para a bandeja"
          hint="Fechar a janela mantém você na chamada. Pra sair de vez, use o menu da bandeja."
          checked={settings.closeToTray}
          onCheckedChange={(closeToTray) => void update({ closeToTray })}
        />
      </section>
    </div>
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
