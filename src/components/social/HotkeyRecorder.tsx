import * as React from 'react'
import { Keyboard, X, Check, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHotkeys } from '@/lib/hotkeys-context'

/**
 * Campo que grava uma combinacao de teclas e devolve um accelerator do Electron.
 *
 * Guarda o `code` da tecla (posicao fisica), nao o `key` (caractere): num
 * teclado ABNT2 o `key` muda com o layout, e um atalho que so funciona em US
 * seria um bug chato de rastrear.
 */

const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight'
])

/** Converte o code do DOM pro nome que o Electron entende. */
function codeToKeyName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^Numpad[0-9]$/.test(code)) return 'num' + code.slice(6)
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code

  const map: Record<string, string> = {
    Space: 'Space',
    Enter: 'Return',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Escape',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backquote: '`',
    NumpadAdd: 'numadd',
    NumpadSubtract: 'numsub',
    NumpadMultiply: 'nummult',
    NumpadDivide: 'numdiv',
    NumpadDecimal: 'numdec'
  }

  return map[code] ?? null
}

export function eventToAccelerator(e: KeyboardEvent | React.KeyboardEvent): string | null {
  if (MODIFIER_CODES.has(e.code)) return null

  const keyName = codeToKeyName(e.code)
  if (!keyName) return null

  const parts: string[] = []
  if (e.ctrlKey) parts.push('Control')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Super')
  parts.push(keyName)

  return parts.join('+')
}

/** Versao curta e legivel pra mostrar na tela. */
export function formatAccelerator(accelerator: string): string {
  if (!accelerator) return 'Sem atalho'
  return accelerator
    .replace('Control', 'Ctrl')
    .replace('Super', 'Win')
    .replace('Return', 'Enter')
    .split('+')
    .join(' + ')
}

interface HotkeyRecorderProps {
  value: string
  onChange: (accelerator: string) => void
  placeholder?: string
  className?: string
}

export function HotkeyRecorder({
  value,
  onChange,
  placeholder = 'Clique e aperte a tecla',
  className
}: HotkeyRecorderProps) {
  const { probe } = useHotkeys()
  const [recording, setRecording] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!recording) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()

      if (e.code === 'Escape') {
        setRecording(false)
        setProblem(null)
        return
      }

      const accelerator = eventToAccelerator(e)
      if (!accelerator) return

      setRecording(false)

      void probe(accelerator).then((result) => {
        if (result.ok) {
          setProblem(null)
          onChange(accelerator)
        } else {
          setProblem(result.error ?? 'Atalho indisponível')
        }
      })
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [recording, probe, onChange])

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={() => {
          setProblem(null)
          setRecording((prev) => !prev)
        }}
        className={cn(
          'flex h-8 min-w-[9rem] items-center gap-2 rounded-brutal border-2 px-2.5',
          'font-mono text-[11px] uppercase tracking-wider transition-colors',
          recording
            ? 'border-acid bg-acid/10 text-acid'
            : problem
              ? 'border-destructive/60 text-destructive'
              : 'border-line text-foreground hover:border-acid/50 hover:text-foreground'
        )}
      >
        <Keyboard className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {recording ? 'Aperte…' : value ? formatAccelerator(value) : placeholder}
        </span>
        {!recording && value && !problem && (
          <Check className="ml-auto h-3 w-3 shrink-0 text-acid" />
        )}
      </button>

      {value && !recording && (
        <button
          type="button"
          title="Remover atalho"
          onClick={() => {
            onChange('')
            setProblem(null)
          }}
          className="rounded-brutal p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {problem && (
        <span className="flex items-center gap-1 text-[11px] text-destructive">
          <TriangleAlert className="h-3 w-3 shrink-0" />
          {problem}
        </span>
      )}
    </div>
  )
}
