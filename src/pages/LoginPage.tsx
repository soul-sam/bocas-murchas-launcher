import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Skull, LogIn } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { useSound } from '@/lib/use-sound'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const playSound = useSound()
  const [identifier, setIdentifier] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(identifier.trim(), password)
      playSound('success')
      navigate('/', { replace: true })
    } catch (err) {
      playSound('error')
      if (err instanceof ApiError) setError(err.message)
      else setError('Falha ao conectar. Verifique se a API está online.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="card-acid w-full max-w-md rounded-brutal p-8 scanlines">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Skull className="h-12 w-12 text-acid drop-shadow-[0_0_15px_rgba(106,255,0,0.6)]" />
          <h1 className="title-brutal text-4xl">Bocas Murchas</h1>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Launcher v0.1.0 <span className="terminal-cursor" />
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="identifier">Usuário ou Email</Label>
            <Input
              id="identifier"
              autoFocus
              autoComplete="username"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="seu_nick"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="rounded-brutal border-2 border-destructive bg-destructive/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" disabled={submitting} className="w-full" size="lg">
            <LogIn className="mr-2 h-4 w-4" />
            {submitting ? 'Conectando…' : 'Entrar'}
          </Button>
        </form>

        <div className="mt-6 text-center text-xs uppercase tracking-widest text-muted-foreground">
          Sem conta?{' '}
          <Link to="/register" className="font-bold text-acid hover:underline">
            Use seu código
          </Link>
        </div>
      </div>
    </div>
  )
}
