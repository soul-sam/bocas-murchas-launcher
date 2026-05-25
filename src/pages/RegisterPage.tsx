import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { KeyRound, UserPlus } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { useSound } from '@/lib/use-sound'

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const playSound = useSound()
  const [form, setForm] = React.useState({
    inviteCode: '',
    username: '',
    displayName: '',
    email: '',
    password: ''
  })
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  function update<K extends keyof typeof form>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await register({
        ...form,
        inviteCode: form.inviteCode.toUpperCase().trim(),
        username: form.username.trim(),
        email: form.email.trim()
      })
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
        <div className="mb-6 flex flex-col items-center gap-2">
          <KeyRound className="h-10 w-10 text-burn drop-shadow-[0_0_15px_rgba(242,183,5,0.6)]" />
          <h1 className="title-brutal text-3xl">Novo Membro</h1>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Insira o código de convite do grupo
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inviteCode">Código de Convite</Label>
            <Input
              id="inviteCode"
              required
              autoFocus
              value={form.inviteCode}
              onChange={update('inviteCode')}
              placeholder="BOCAS-XXXX-XXXX"
              className="font-mono uppercase tracking-widest"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="username">Usuário</Label>
              <Input
                id="username"
                required
                value={form.username}
                onChange={update('username')}
                placeholder="nick"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Nome</Label>
              <Input
                id="displayName"
                required
                value={form.displayName}
                onChange={update('displayName')}
                placeholder="Seu Nome"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={update('email')}
              placeholder="voce@email.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={update('password')}
              placeholder="mínimo 6 caracteres"
            />
          </div>

          {error && (
            <div className="rounded-brutal border-2 border-destructive bg-destructive/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" disabled={submitting} className="w-full" size="lg">
            <UserPlus className="mr-2 h-4 w-4" />
            {submitting ? 'Criando…' : 'Entrar para o grupo'}
          </Button>
        </form>

        <div className="mt-6 text-center text-xs uppercase tracking-widest text-muted-foreground">
          Já tem conta?{' '}
          <Link to="/login" className="font-bold text-acid hover:underline">
            Faça login
          </Link>
        </div>
      </div>
    </div>
  )
}
