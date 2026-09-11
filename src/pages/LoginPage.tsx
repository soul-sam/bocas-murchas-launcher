import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { useSettings } from '@/lib/settings-context'
import { playUiSound } from '@/lib/ui-sounds'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const { settings } = useSettings()
  // Avisos sintetizados (ui-sounds), no volume que a pessoa escolheu.
  const cueVolume = settings.soundEnabled ? settings.soundVolume : 0
  const [identifier, setIdentifier] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [version, setVersion] = React.useState<string | null>(null)

  // A versao vinha escrita a mao no JSX e envelheceu 15 releases atras
  // (dizia 0.1.0 com o package.json em 1.6.0). Vem do main agora.
  React.useEffect(() => {
    void window.bocas.app
      .version()
      .then(setVersion)
      .catch(() => setVersion(null))
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(identifier.trim(), password)
      playUiSound('self-join', cueVolume)
      navigate('/', { replace: true })
    } catch (err) {
      playUiSound('self-leave', cueVolume)
      if (err instanceof ApiError) setError(err.message)
      else setError('Falha ao conectar. Verifique se a API está online.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-8">
      <div className="card-acid w-full max-w-md rounded-brutal p-8 scanlines-brand">
        <div className="mb-8 flex flex-col items-center gap-3">
          {/* A logo de login e a UNICA que ja traz o wordmark desenhado —
              por isso nao ha <h1> aqui. O resto do app usa a versao so-cara
              (bocas-murchas-transp.png), que some em tamanho pequeno se
              vier com as letras junto. */}
          <img
            src="logo-login.png"
            alt="Bocas Murchas"
            width={640}
            height={640}
            className="h-40 w-auto select-none"
            draggable={false}
          />
          <p className="text-xs text-muted-foreground">
            Launcher {version ? `v${version}` : '—'} <span className="terminal-cursor" />
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
