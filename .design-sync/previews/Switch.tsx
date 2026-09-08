import * as React from 'react'
import { Switch } from 'bocas-murchas-launcher'

const noop = () => {}

/** Os dois estados lado a lado — ligado ganha borda e polegar acid. */
export function Estados() {
  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
      <Switch checked={false} onCheckedChange={noop} aria-label="Desligado" />
      <Switch checked onCheckedChange={noop} aria-label="Ligado" />
    </div>
  )
}

/** Desabilitado nos dois estados: opacidade 50%, cursor bloqueado. */
export function Desabilitado() {
  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
      <Switch checked={false} onCheckedChange={noop} disabled aria-label="Desligado" />
      <Switch checked onCheckedChange={noop} disabled aria-label="Ligado" />
    </div>
  )
}
