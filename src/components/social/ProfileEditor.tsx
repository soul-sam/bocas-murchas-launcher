import * as React from 'react'
import {
  Cake,
  Clock,
  Gamepad2,
  ImageIcon,
  ImagePlus,
  Link as LinkIcon,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UserAvatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { useGamification } from '@/lib/gamification-context'
import {
  users as usersApi,
  uploads as uploadsApi,
  parseFavoriteGames,
  parseLinks,
  resolveAssetUrl,
  type ProfileLink
} from '@/lib/api'
import { DEFAULT_NAME_COLOR } from '@/lib/api-gamification'
import {
  MONTHS,
  daysInMonth,
  detectTimezone,
  formatBirthday,
  localTimeIn,
  parseBirthday,
  timezoneOptions
} from '@/lib/profile-extras'
import { TitleTag } from '@/lib/cosmetic-icons'
import { GAME_CATALOG, GameIcon, gameLabel } from './GameIcon'
import { GifPicker } from './GifPicker'
import { NameEffect } from './NameEffect'

/**
 * Editor do perfil.
 *
 * Três abas, porque num painel único a pessoa rolava três telas e desistia
 * antes de achar os links: **Identidade** (quem você é), **Aparência** (foto
 * e capa, e SÓ isso) e **Sobre você** (aniversário, fuso, jogos, links).
 *
 * APARÊNCIA É FOTO E CAPA. Cor do nome, título, efeito e moldura — tudo que
 * muda como o nome aparece pra quem está no servidor — vem da Lojinha, e é lá
 * que se escolhe o que usar (o botão Equipar). Antes havia um seletor de cor
 * livre aqui e os cosméticos apareciam nas duas telas; a cor virou item de
 * loja (comum a lendário) e o servidor ignora `profileColor` neste PUT.
 *
 * IMAGEM sobe como arquivo (endpoint /uploads) ou vem de uma URL que o
 * servidor copia (/uploads/from-url) — nunca base64 no JSON, que incharia
 * cada listagem de usuários com o avatar inteiro embutido.
 *
 * O SELETOR DE GIF é um painel que ocupa o lugar do formulário, não uma
 * segunda modal: duas camadas do Radix sobrepostas travavam a interface
 * inteira (ver lib/interaction-guard.ts).
 */

/** Os mais usados como botão; o campo continua aceitando qualquer coisa. */
const PRONOUN_PRESETS = ['ele/dele', 'ela/dela', 'elu/delu', 'ele/ela']

const MAX_LINKS = 5
const MAX_GAMES = 6

type GifTarget = 'avatar' | 'banner' | null

export function ProfileEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token, user, applyUser } = useAuth()

  const [displayName, setDisplayName] = React.useState('')
  const [bio, setBio] = React.useState('')
  const [pronouns, setPronouns] = React.useState('')
  const [customStatus, setCustomStatus] = React.useState('')
  const [avatar, setAvatar] = React.useState<string | null>(null)
  const [banner, setBanner] = React.useState<string | null>(null)
  const [links, setLinks] = React.useState<ProfileLink[]>([])
  const [birthMonth, setBirthMonth] = React.useState('')
  const [birthDay, setBirthDay] = React.useState('')
  const [timezone, setTimezone] = React.useState('')
  const [games, setGames] = React.useState<string[]>([])
  const [gameDraft, setGameDraft] = React.useState('')

  const [busy, setBusy] = React.useState(false)
  const [working, setWorking] = React.useState<'avatar' | 'banner' | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [gifFor, setGifFor] = React.useState<GifTarget>(null)
  /**
   * Aba controlada por estado, e nao pelo `defaultValue` do Radix.
   *
   * O seletor de GIF desmonta as abas enquanto esta aberto (ele ocupa o lugar
   * delas). Com `defaultValue`, voltar do seletor remontava as abas na
   * primeira: a pessoa ia em Aparencia, escolhia um GIF, e caia em Identidade
   * sem ver o resultado no campo onde estava mexendo.
   */
  const [tab, setTab] = React.useState('identidade')

  /**
   * Preenche o formulário com o usuário — UMA VEZ por abertura.
   *
   * O `user` está nas dependências só pra cobrir o caso de o diálogo abrir
   * antes do perfil chegar; `hydratedRef` garante que a partir daí ele não
   * mexe mais no que está sendo digitado.
   *
   * ISSO NÃO É DETALHE. Antes o efeito rodava a cada mudança do `user`, e
   * qualquer coisa que atualizasse o usuário no meio da edição jogava o
   * formulário de volta pro que está salvo. Acontecia de dois jeitos: ao
   * equipar um cosmético aqui mesmo (equipar salva na hora e devolve o
   * usuário novo), e quando o servidor manda `user:profileUpdated` sozinho —
   * o launcher grava o Riot ID assim que o LoL abre. Nos dois casos a pessoa
   * perdia o GIF que acabou de escolher, ou o texto da bio, sem nada na tela
   * explicando por quê.
   */
  const hydratedRef = React.useRef(false)

  React.useEffect(() => {
    if (!open) {
      hydratedRef.current = false
      return
    }
    if (hydratedRef.current || !user) return
    hydratedRef.current = true

    setDisplayName(user.displayName ?? '')
    setBio(user.bio ?? '')
    setPronouns(user.pronouns ?? '')
    setCustomStatus(user.customStatus ?? '')
    setAvatar(user.avatar ?? null)
    setBanner(user.banner ?? null)
    setLinks(parseLinks(user.links))
    setGames(parseFavoriteGames(user.favoriteGames))
    const birthday = parseBirthday(user.birthday)
    setBirthMonth(birthday?.month ?? '')
    setBirthDay(birthday?.day ?? '')
    setTimezone(user.timezone ?? '')
    setGameDraft('')
    setError(null)
    setGifFor(null)
    setTab('identidade')
  }, [open, user])

  const handleFile = async (kind: 'avatar' | 'banner', file: File | null): Promise<void> => {
    if (!file || !token) return
    setWorking(kind)
    setError(null)
    try {
      const { url } = await uploadsApi.image(token, kind, file)
      if (kind === 'avatar') setAvatar(url)
      else setBanner(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao subir imagem')
    } finally {
      setWorking(null)
    }
  }

  /**
   * GIF escolhido (ou URL colada): o SERVIDOR baixa e guarda, e o perfil fica
   * com a nossa URL. Ver uploads.fromUrl em lib/api.ts pro porquê.
   */
  const handleUrl = async (kind: 'avatar' | 'banner', url: string): Promise<void> => {
    if (!token) return
    setGifFor(null)
    setWorking(kind)
    setError(null)
    try {
      const result = await uploadsApi.fromUrl(token, kind, url)
      if (kind === 'avatar') setAvatar(result.url)
      else setBanner(result.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao trazer essa imagem')
    } finally {
      setWorking(null)
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!token) return
    if (!displayName.trim()) {
      setError('O nome de exibição não pode ficar vazio')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const updated = await usersApi.updateProfile(token, {
        displayName: displayName.trim(),
        bio: bio.trim() || null,
        pronouns: pronouns.trim() || null,
        customStatus: customStatus.trim() || null,
        avatar,
        banner,
        // Link sem nome ou sem url é lixo; o servidor descartaria de qualquer jeito.
        links: links.filter((l) => l.name.trim() && l.url.trim()),
        // Mês sem dia (ou dia sem mês) não é data: some como "não informado".
        birthday: birthMonth && birthDay ? `${birthMonth}-${birthDay}` : null,
        timezone: timezone || null,
        favoriteGames: games
      })
      applyUser(updated)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar perfil')
    } finally {
      setBusy(false)
    }
  }

  const updateLink = (index: number, patch: Partial<ProfileLink>): void => {
    setLinks((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  const toggleGame = (key: string): void => {
    setGames((prev) =>
      prev.includes(key)
        ? prev.filter((g) => g !== key)
        : prev.length >= MAX_GAMES
          ? prev
          : [...prev, key]
    )
  }

  const addGameDraft = (): void => {
    const key = gameDraft.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 24)
    if (!key || games.includes(key) || games.length >= MAX_GAMES) return
    setGames((prev) => [...prev, key])
    setGameDraft('')
  }

  const birthdayLabel =
    birthMonth && birthDay ? formatBirthday(`${birthMonth}-${birthDay}`) : null

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Seu perfil</DialogTitle>
          <DialogDescription>É o que a galera vê quando clica em você</DialogDescription>
        </DialogHeader>

        {gifFor ? (
          <GifPicker
            kind={gifFor}
            onPick={(url) => void handleUrl(gifFor, url)}
            onCancel={() => setGifFor(null)}
          />
        ) : (
          <>
            <ProfilePreview
              displayName={displayName}
              username={user?.username ?? ''}
              pronouns={pronouns}
              customStatus={customStatus}
              profileColor={user?.profileColor ?? DEFAULT_NAME_COLOR}
              avatar={avatar}
              banner={banner}
              title={user?.title}
              nameEffect={user?.nameEffect}
              avatarFrame={user?.avatarFrame}
              birthdayLabel={birthdayLabel}
              timezone={timezone}
              games={games}
            />

            <Tabs
              value={tab}
              onValueChange={setTab}
              className="mt-4 flex min-h-0 flex-1 flex-col"
            >
              <TabsList>
                <TabsTrigger value="identidade">Identidade</TabsTrigger>
                <TabsTrigger value="aparencia">Aparência</TabsTrigger>
                <TabsTrigger value="sobre">Sobre você</TabsTrigger>
              </TabsList>

              {/* ---------------------------------------------- IDENTIDADE */}
              <TabsContent value="identidade" className="space-y-5 pr-1">
                <div className="space-y-1.5">
                  <Label htmlFor="p-name">Nome de exibição</Label>
                  <Input
                    id="p-name"
                    value={displayName}
                    maxLength={32}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="p-pronouns">Pronomes</Label>
                  <div className="flex flex-wrap gap-1">
                    {PRONOUN_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        // Clicar no que já está escolhido limpa: é o caminho
                        // pra "prefiro não dizer" sem ter que apagar texto.
                        onClick={() => setPronouns((current) => (current === preset ? '' : preset))}
                        className={cn(
                          'rounded-brutal border-2 px-2 py-1 font-mono text-[11.5px] uppercase tracking-widest transition-colors',
                          pronouns === preset
                            ? 'border-acid bg-acid/10 text-acid'
                            : 'border-line text-muted-foreground hover:border-acid/50 hover:text-foreground'
                        )}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <Input
                    id="p-pronouns"
                    value={pronouns}
                    maxLength={24}
                    placeholder="ou escreve do seu jeito"
                    onChange={(e) => setPronouns(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="p-status">Recado</Label>
                  <Input
                    id="p-status"
                    value={customStatus}
                    maxLength={64}
                    placeholder="jogando, no trampo, dormindo…"
                    onChange={(e) => setCustomStatus(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="p-bio">Bio</Label>
                  <textarea
                    id="p-bio"
                    value={bio}
                    maxLength={300}
                    rows={4}
                    onChange={(e) => setBio(e.target.value)}
                    className="input-terminal w-full resize-none rounded-brutal p-2 text-sm"
                  />
                  <p className="text-right font-mono text-[11.5px] text-muted-foreground">
                    {bio.length}/300
                  </p>
                </div>
              </TabsContent>

              {/* ----------------------------------------------- APARÊNCIA */}
              <TabsContent value="aparencia" className="space-y-5 pr-1">
                <div className="grid gap-3 sm:grid-cols-2">
                  <ImageField
                    label="Foto de perfil"
                    hint="quadrada · até 2 MB (GIF vale)"
                    value={avatar}
                    working={working === 'avatar'}
                    onFile={(file) => void handleFile('avatar', file)}
                    onGif={() => setGifFor('avatar')}
                    onClear={() => setAvatar(null)}
                  />
                  <ImageField
                    label="Capa"
                    hint="deitada · até 4 MB (GIF vale)"
                    value={banner}
                    working={working === 'banner'}
                    wide
                    onFile={(file) => void handleFile('banner', file)}
                    onGif={() => setGifFor('banner')}
                    onClear={() => setBanner(null)}
                  />
                </div>

                <p className="text-xs leading-snug text-muted-foreground">
                  Cor do nome, título, efeito e moldura vêm da Lojinha — é lá que
                  você compra e escolhe o que usar.
                </p>
              </TabsContent>

              {/* --------------------------------------------- SOBRE VOCÊ */}
              <TabsContent value="sobre" className="space-y-5 pr-1">
                {/* Aniversário */}
                <div className="space-y-1.5">
                  <Label>Aniversário</Label>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={birthDay}
                      onChange={(e) => setBirthDay(e.target.value)}
                      aria-label="Dia do aniversário"
                      className="input-terminal h-9 w-20 rounded-brutal px-2 text-sm"
                    >
                      <option value="">dia</option>
                      {Array.from(
                        { length: daysInMonth(birthMonth || '01') },
                        (_, i) => String(i + 1).padStart(2, '0')
                      ).map((day) => (
                        <option key={day} value={day}>
                          {Number(day)}
                        </option>
                      ))}
                    </select>

                    <select
                      value={birthMonth}
                      onChange={(e) => {
                        const month = e.target.value
                        setBirthMonth(month)
                        // 31 escolhido e depois fevereiro: o dia precisa ceder,
                        // senão sairia daqui um "31-02" pra o servidor recusar.
                        if (month && birthDay && Number(birthDay) > daysInMonth(month)) {
                          setBirthDay(String(daysInMonth(month)).padStart(2, '0'))
                        }
                      }}
                      aria-label="Mês do aniversário"
                      className="input-terminal h-9 min-w-0 flex-1 rounded-brutal px-2 text-sm"
                    >
                      <option value="">mês</option>
                      {MONTHS.map((month) => (
                        <option key={month.value} value={month.value}>
                          {month.label}
                        </option>
                      ))}
                    </select>

                    {(birthMonth || birthDay) && (
                      <button
                        type="button"
                        onClick={() => {
                          setBirthMonth('')
                          setBirthDay('')
                        }}
                        title="Limpar aniversário"
                        className="shrink-0 rounded-brutal p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-[11.5px] text-muted-foreground">
                    sem ano — só o dia, pra galera lembrar
                  </p>
                </div>

                {/* Fuso */}
                <div className="space-y-1.5">
                  <Label htmlFor="p-tz">Fuso horário</Label>
                  <div className="flex items-center gap-1.5">
                    <select
                      id="p-tz"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="input-terminal h-9 min-w-0 flex-1 rounded-brutal px-2 text-sm"
                    >
                      <option value="">não informar</option>
                      {timezoneOptions().map((zone) => (
                        <option key={zone} value={zone}>
                          {zone.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setTimezone(detectTimezone())}
                      className="shrink-0 rounded-brutal border-2 border-line px-2 py-1.5 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-acid/50 hover:text-foreground"
                    >
                      usar o meu
                    </button>
                  </div>
                  <p className="text-[11.5px] text-muted-foreground">
                    {timezone
                      ? `agora são ${localTimeIn(timezone) ?? '--:--'} pra você`
                      : 'aparece no seu perfil como "que horas são pra essa pessoa"'}
                  </p>
                </div>

                {/* Jogos */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Jogos que você joga</Label>
                    <span className="font-mono text-[11.5px] text-muted-foreground">
                      {games.length}/{MAX_GAMES}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {GAME_CATALOG.map((game) => {
                      const on = games.includes(game.key)
                      return (
                        <button
                          key={game.key}
                          type="button"
                          onClick={() => toggleGame(game.key)}
                          disabled={!on && games.length >= MAX_GAMES}
                          className={cn(
                            'flex items-center gap-1 rounded-brutal border-2 px-2 py-1 font-mono text-[11.5px] uppercase tracking-widest transition-colors',
                            on
                              ? 'border-acid bg-acid/10 text-acid'
                              : 'border-line text-muted-foreground hover:border-acid/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted-foreground'
                          )}
                        >
                          <GameIcon game={game.key} className="h-3 w-3" />
                          {game.label}
                        </button>
                      )
                    })}
                  </div>

                  {/* Jogos digitados na mão, que não estão na lista de cima. */}
                  {games.filter((g) => !GAME_CATALOG.some((c) => c.key === g)).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {games
                        .filter((g) => !GAME_CATALOG.some((c) => c.key === g))
                        .map((game) => (
                          <button
                            key={game}
                            type="button"
                            onClick={() => toggleGame(game)}
                            title="Tirar da lista"
                            className="flex items-center gap-1 rounded-brutal border-2 border-acid bg-acid/10 px-2 py-1 font-mono text-[11.5px] uppercase tracking-widest text-acid"
                          >
                            <Gamepad2 className="h-3 w-3" />
                            {gameLabel(game)}
                            <X className="h-3 w-3" />
                          </button>
                        ))}
                    </div>
                  )}

                  {games.length < MAX_GAMES && (
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={gameDraft}
                        placeholder="outro jogo…"
                        maxLength={24}
                        onChange={(e) => setGameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return
                          // Enter aqui NÃO pode submeter o diálogo inteiro.
                          e.preventDefault()
                          addGameDraft()
                        }}
                        className="h-8 flex-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={addGameDraft}
                        disabled={!gameDraft.trim()}
                        className="shrink-0 rounded-brutal border-2 border-line p-1.5 text-muted-foreground transition-colors hover:border-acid/50 hover:text-foreground disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Links */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Links</Label>
                    {links.length < MAX_LINKS && (
                      <button
                        type="button"
                        onClick={() => setLinks((prev) => [...prev, { name: '', url: '' }])}
                        className="flex items-center gap-1 font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <Plus className="h-3 w-3" />
                        adicionar
                      </button>
                    )}
                  </div>

                  {links.length === 0 ? (
                    <p className="text-[11.5px] text-muted-foreground">
                      nenhum link
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {links.map((link, index) => (
                        <div key={index} className="flex items-center gap-1.5">
                          <LinkIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <Input
                            value={link.name}
                            placeholder="Nome"
                            maxLength={32}
                            onChange={(e) => updateLink(index, { name: e.target.value })}
                            className="h-8 w-28 text-xs"
                          />
                          <Input
                            value={link.url}
                            placeholder="https://…"
                            onChange={(e) => updateLink(index, { url: e.target.value })}
                            className="h-8 flex-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => setLinks((prev) => prev.filter((_, i) => i !== index))}
                            className="shrink-0 rounded-brutal p-1 text-muted-foreground transition-colors hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11.5px] text-muted-foreground">
                    só http(s) · máximo {MAX_LINKS}
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}

        {error && <p className="mt-2 shrink-0 text-xs text-destructive">{error}</p>}

        {!gifFor && (
          <DialogFooter>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSave()} disabled={busy || working !== null}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ============================================
// PRÉVIA
// ============================================

/**
 * O cartão como a galera vai ver.
 *
 * Vive fora das abas de propósito: a pessoa mexe na cor na aba Aparência e no
 * nome na aba Identidade, e nos dois casos precisa ver o resultado sem trocar
 * de aba.
 */
function ProfilePreview({
  displayName,
  username,
  pronouns,
  customStatus,
  profileColor,
  avatar,
  banner,
  title,
  nameEffect,
  avatarFrame,
  birthdayLabel,
  timezone,
  games
}: {
  displayName: string
  username: string
  pronouns: string
  customStatus: string
  profileColor: string
  avatar: string | null
  banner: string | null
  title?: string | null
  nameEffect?: string | null
  avatarFrame?: string | null
  birthdayLabel: string | null
  timezone: string
  games: string[]
}) {
  const { cosmeticName } = useGamification()
  const titleName = cosmeticName(title)
  const localTime = localTimeIn(timezone)

  return (
    <div className="shrink-0 overflow-hidden rounded-brutal border-2 border-line">
      <div
        className="h-20 bg-void-light"
        style={
          banner
            ? {
                backgroundImage: `url(${resolveAssetUrl(banner)})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }
            : { background: `linear-gradient(135deg, ${profileColor}22, transparent)` }
        }
      />

      <div className="flex items-end gap-3 px-3 pb-3">
        <UserAvatar
          src={resolveAssetUrl(avatar)}
          name={displayName || username || '??'}
          ringColor={profileColor}
          frame={avatarFrame}
          className="-mt-6 h-16 w-16 border-2"
        />

        <div className="min-w-0 flex-1 pb-0.5">
          <p className="flex items-center gap-1.5 truncate font-display text-base">
            <NameEffect
              effect={nameEffect}
              className="truncate"
              style={{ color: profileColor }}
            >
              {displayName || 'Sem nome'}
            </NameEffect>
            {titleName && <TitleTag titleId={title} name={titleName} />}
          </p>
          <p className="truncate text-[11.5px] text-muted-foreground">
            @{username}
            {pronouns && ` · ${pronouns}`}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11.5px] text-muted-foreground">
            {localTime && (
              <span className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {localTime}
              </span>
            )}
            {birthdayLabel && (
              <span className="flex items-center gap-1">
                <Cake className="h-2.5 w-2.5" />
                {birthdayLabel}
              </span>
            )}
            {games.slice(0, 4).map((game) => (
              <span key={game} className="flex items-center gap-1" title={gameLabel(game)}>
                <GameIcon game={game} className="h-2.5 w-2.5" />
              </span>
            ))}
          </div>
        </div>
      </div>

      {customStatus && (
        <p className="mx-3 mb-3 truncate rounded-brutal border border-line bg-void/60 px-2 py-1 text-xs text-foreground">
          {customStatus}
        </p>
      )}
    </div>
  )
}

// ============================================
// IMAGEM (ARQUIVO OU GIF)
// ============================================

function ImageField({
  label,
  hint,
  value,
  working,
  wide,
  onFile,
  onGif,
  onClear
}: {
  label: string
  hint: string
  value: string | null
  working: boolean
  wide?: boolean
  onFile: (file: File | null) => void
  onGif: () => void
  onClear: () => void
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>

      <div
        className={cn(
          'flex items-center justify-center overflow-hidden rounded-brutal border-2 border-line bg-void-light',
          wide ? 'h-16' : 'h-16 w-16'
        )}
        style={
          value
            ? {
                backgroundImage: `url(${resolveAssetUrl(value)})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }
            : undefined
        }
      >
        {working ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : !value ? (
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <label
          className={cn(
            'flex cursor-pointer items-center gap-1 rounded-brutal border-2 border-line px-2 py-1',
            'font-mono text-[11.5px] uppercase tracking-widest text-muted-foreground',
            'transition-colors hover:border-acid/50 hover:text-foreground'
          )}
        >
          <Upload className="h-3 w-3" />
          arquivo
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <button
          type="button"
          onClick={onGif}
          className="flex items-center gap-1 rounded-brutal border-2 border-acid/60 px-2 py-1 font-mono text-[11.5px] uppercase tracking-widest text-acid transition-colors hover:bg-acid/10"
        >
          <ImagePlus className="h-3 w-3" />
          gif
        </button>

        {value && (
          <button
            type="button"
            onClick={onClear}
            title={`Remover ${label.toLowerCase()}`}
            className="rounded-brutal p-1 text-muted-foreground transition-colors hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}
