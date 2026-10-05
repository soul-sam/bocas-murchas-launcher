import * as React from 'react'
import {
  Check,
  ImagePlus,
  Link as LinkIcon,
  Loader2,
  Play,
  Plus,
  Trash2,
  Upload,
  X
} from 'lucide-react'
import { GameIcon as BocasGameIcon, ShopIcon } from '@/lib/bocas-icons'
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
import { Hint } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { useGamification } from '@/lib/gamification-context'
import { useOverlays } from '@/lib/overlay-context'
import { useSettings } from '@/lib/settings-context'
import { playJoinSound } from '@/lib/ui-sounds'
import {
  users as usersApi,
  uploads as uploadsApi,
  parseFavoriteGames,
  parseLinks,
  resolveAssetUrl,
  type AuthUser,
  type ProfileLink,
  type ProfilePatch
} from '@/lib/api'
import { useMembers } from '@/lib/members-context'
import {
  RARITY_COLOR,
  RARITY_LABEL,
  cosmeticEmoji,
  cosmeticSound,
  cosmeticTheme,
  type CosmeticType,
  type Rarity,
  type ShopItem
} from '@/lib/api-gamification'
import { ThemeSwatch } from '@/components/ThemeSwatch'
import { DEFAULT_SETTINGS, type ThemeId } from '../../../electron/preload/types'
import {
  MONTHS,
  daysInMonth,
  detectTimezone,
  localTimeIn,
  parseBirthday,
  timezoneOptions
} from '@/lib/profile-extras'
import { TitleTag } from '@/lib/cosmetic-icons'
import { StatusComposer } from './StatusComposer'
import { GAME_CATALOG, GameIcon, gameLabel } from './GameIcon'
import { GifPicker } from './GifPicker'
import { NameEffect } from './NameEffect'
import { NameEmoji } from './NameEmoji'
import { ProfileHero, ProfileIdentity } from './ProfileCard'

/**
 * Editor do perfil.
 *
 * A PRÉVIA É O PERFIL. O topo do editor desenha o mesmo <ProfileHero> e a
 * mesma <ProfileIdentity> que o modal de perfil usa — com o que está sendo
 * digitado. Antes era um cartão próprio, menor e diferente (capa de 80px,
 * foto de 64), e a pessoa salvava sem saber como ia ficar. Foto e capa se
 * trocam ALI, em cima da prévia, não numa aba à parte com miniaturas de 64px.
 *
 * Três abas: **Identidade** (nome, pronomes, recado, bio), **Estilo** (o que
 * a pessoa TEM da Lojinha e pode vestir: cor, título, efeito, moldura, emoji,
 * som — equipar salva na hora) e **Sobre você** (aniversário, fuso, jogos,
 * links). Até aqui a personalização comprada só se trocava dentro da Lojinha;
 * quem abria "editar perfil" via um aviso mandando ir lá.
 *
 * A COR DO NOME equipa pela mesma rota dos outros (`/gamification/equip`
 * com `nameColor`); a API grava o hex em `profileColor` e recusa cor que a
 * pessoa não comprou.
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

/** O que o formulário tem, do jeito que vai pro `PUT /users/me`. */
interface ProfileForm {
  displayName: string
  bio: string
  pronouns: string
  customStatus: string
  avatar: string | null
  banner: string | null
  links: ProfileLink[]
  birthMonth: string
  birthDay: string
  timezone: string
  games: string[]
}

function formToPatch(form: ProfileForm): ProfilePatch {
  return {
    displayName: form.displayName.trim(),
    bio: form.bio.trim() || null,
    pronouns: form.pronouns.trim() || null,
    customStatus: form.customStatus.trim() || null,
    avatar: form.avatar,
    banner: form.banner,
    // Link sem nome ou sem url é lixo; o servidor descartaria de qualquer jeito.
    links: form.links.filter((l) => (l.name ?? '').trim() && (l.url ?? '').trim()),
    // Mês sem dia (ou dia sem mês) não é data: some como "não informado".
    birthday: form.birthMonth && form.birthDay ? `${form.birthMonth}-${form.birthDay}` : null,
    timezone: form.timezone || null,
    favoriteGames: form.games
  }
}

/** Links chegam como string JSON (lista de membros) ou já como array (`/auth/me`). */
function linksFrom(raw: unknown): ProfileLink[] {
  if (Array.isArray(raw)) return raw as ProfileLink[]
  return parseLinks(typeof raw === 'string' ? raw : null)
}

export function ProfileEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token, user, applyUser } = useAuth()
  const { byId } = useMembers()
  const { openShop } = useOverlays()
  const { profile, cosmeticName } = useGamification()

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
   * primeira: a pessoa ia trocar a capa, escolhia um GIF, e caia em Identidade
   * sem ver o resultado.
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
   * formulário de volta pro que está salvo. Acontece de dois jeitos: ao
   * equipar um cosmético aqui mesmo (equipar salva na hora e devolve o
   * usuário novo), e quando o servidor manda `user:profileUpdated` sozinho —
   * o launcher grava o Riot ID assim que o LoL abre. Nos dois casos a pessoa
   * perdia o GIF que acabou de escolher, ou o texto da bio, sem nada na tela
   * explicando por quê.
   */
  const hydratedRef = React.useRef(false)
  /**
   * O formulário como abriu, já no formato do PUT. Salvar manda SÓ o que
   * difere disto: o usuário da sessão vem incompleto (o login não traz capa,
   * bio nem links; o `/auth/me` não traz aniversário, fuso nem jogos), e
   * mandar o formulário inteiro gravava `null`/`[]` por cima do que a pessoa
   * tinha — trocar só a bio apagava links, aniversário e jogos.
   */
  const initialRef = React.useRef<ProfilePatch>({})

  React.useEffect(() => {
    if (!open) {
      hydratedRef.current = false
      return
    }
    if (hydratedRef.current || !user) return
    hydratedRef.current = true

    // Campo que a sessão não trouxe sai da lista de membros, que vem do
    // `/users` com o perfil inteiro e acompanha `user:profileUpdated`.
    const member = byId[user.id]
    const pick = <K extends keyof AuthUser>(key: K): AuthUser[K] | undefined =>
      user[key] !== undefined ? user[key] : member?.[key]

    const birthday = parseBirthday(pick('birthday'))
    const form: ProfileForm = {
      displayName: user.displayName ?? '',
      bio: pick('bio') ?? '',
      pronouns: pick('pronouns') ?? '',
      customStatus: user.customStatus ?? '',
      avatar: user.avatar ?? null,
      banner: pick('banner') ?? null,
      links: linksFrom(typeof user.links === 'string' ? user.links : (member?.links ?? user.links)),
      birthMonth: birthday?.month ?? '',
      birthDay: birthday?.day ?? '',
      timezone: pick('timezone') ?? '',
      games: parseFavoriteGames(pick('favoriteGames'))
    }
    initialRef.current = formToPatch(form)

    setDisplayName(form.displayName)
    setBio(form.bio)
    setPronouns(form.pronouns)
    setCustomStatus(form.customStatus)
    setAvatar(form.avatar)
    setBanner(form.banner)
    setLinks(form.links)
    setGames(form.games)
    setBirthMonth(form.birthMonth)
    setBirthDay(form.birthDay)
    setTimezone(form.timezone)
    setGameDraft('')
    setError(null)
    setGifFor(null)
    setTab('identidade')
  }, [open, user, byId])

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

    // Só o que mudou desde que o editor abriu (ver `initialRef`).
    const full = formToPatch({
      displayName,
      bio,
      pronouns,
      customStatus,
      avatar,
      banner,
      links,
      birthMonth,
      birthDay,
      timezone,
      games
    })
    const patch: ProfilePatch = {}
    for (const key of Object.keys(full) as (keyof ProfilePatch)[]) {
      if (JSON.stringify(full[key]) !== JSON.stringify(initialRef.current[key])) {
        ;(patch as Record<string, unknown>)[key] = full[key]
      }
    }
    if (Object.keys(patch).length === 0) {
      onClose()
      return
    }

    setBusy(true)
    setError(null)
    try {
      const updated = await usersApi.updateProfile(token, patch)
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

  /**
   * Abrir a Lojinha de dentro do editor FECHA o editor antes: a Lojinha é
   * uma camada própria no mesmo degrau (`z-dialogo`), e o Dialog do Radix
   * deixa o resto do <body> sem clique enquanto está aberto — a Lojinha
   * nasceria por cima e morta. Ver lib/interaction-guard.ts.
   */
  const goToShop = (): void => {
    onClose()
    openShop()
  }

  const color = user?.profileColor ?? null
  const progress = profile && profile.nextLevelXp > 0 ? profile.levelXp / profile.nextLevelXp : 0
  const previewName = displayName.trim() || user?.username || '??'
  const nameRef = React.useRef<HTMLInputElement | null>(null)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="max-w-2xl max-h-[92dvh]"
        // O Radix focaria o primeiro botão (o "GIF" da capa, que tem dica) e a
        // dica abriria sozinha com o diálogo. O foco vai pro nome.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          nameRef.current?.focus()
        }}
        // Com o seletor de GIF na tela, Esc é "voltar" pro formulário, não
        // fechar o editor com tudo que ainda não foi salvo.
        onEscapeKeyDown={(event) => {
          if (!gifFor) return
          event.preventDefault()
          setGifFor(null)
        }}
      >
        <DialogHeader>
          <DialogTitle>Seu perfil</DialogTitle>
          <DialogDescription>É assim que a galera te vê — mexa e veja na hora</DialogDescription>
        </DialogHeader>

        {gifFor ? (
          <GifPicker
            kind={gifFor}
            onPick={(url) => void handleUrl(gifFor, url)}
            onCancel={() => setGifFor(null)}
          />
        ) : (
          <>
            {/* ------------------------------------------------------ PRÉVIA */}
            <div className="shrink-0 overflow-hidden rounded-brutal border border-line bg-card">
              <ProfileHero
                variant="modal"
                phone
                banner={resolveAssetUrl(banner) ?? null}
                avatar={resolveAssetUrl(avatar) ?? null}
                name={previewName}
                color={color}
                frame={user?.avatarFrame}
                level={profile?.level ?? null}
                progress={progress}
                bannerOverlay={
                  <MediaControls
                    kind="banner"
                    hasValue={!!banner}
                    working={working === 'banner'}
                    onFile={(file) => void handleFile('banner', file)}
                    onGif={() => setGifFor('banner')}
                    onClear={() => setBanner(null)}
                    className="absolute right-2 top-2"
                  />
                }
                avatarOverlay={
                  working === 'avatar' ? (
                    <span className="absolute inset-0 flex items-center justify-center rounded-brutal bg-void/60">
                      <Loader2 className="h-5 w-5 animate-spin text-foreground" />
                    </span>
                  ) : null
                }
                actions={
                  <MediaControls
                    kind="avatar"
                    hasValue={!!avatar}
                    working={false}
                    onFile={(file) => void handleFile('avatar', file)}
                    onGif={() => setGifFor('avatar')}
                    onClear={() => setAvatar(null)}
                  />
                }
              />
              <div className="px-4 pb-4 pt-3">
                <ProfileIdentity
                  size="phone"
                  name={displayName.trim() || 'Sem nome'}
                  username={user?.username ?? ''}
                  pronouns={pronouns.trim() || null}
                  color={color}
                  nameEffect={user?.nameEffect}
                  emoji={user?.emoji}
                  titleId={user?.title}
                  titleName={cosmeticName(user?.title)}
                  role={user?.role}
                  customStatus={customStatus.trim() || null}
                />
              </div>
            </div>

            <Tabs value={tab} onValueChange={setTab} className="mt-4 flex min-h-0 flex-1 flex-col">
              <TabsList>
                <TabsTrigger value="identidade">Identidade</TabsTrigger>
                <TabsTrigger value="estilo">Estilo</TabsTrigger>
                <TabsTrigger value="sobre">Sobre você</TabsTrigger>
              </TabsList>

              {/* ---------------------------------------------- IDENTIDADE */}
              <TabsContent value="identidade" className="space-y-5 pr-1">
                <div className="space-y-1.5">
                  <Label htmlFor="p-name">Nome de exibição</Label>
                  <Input
                    id="p-name"
                    ref={nameRef}
                    value={displayName}
                    maxLength={32}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="p-pronouns">Pronomes</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {PRONOUN_PRESETS.map((preset) => (
                      <Chip
                        key={preset}
                        on={pronouns === preset}
                        // Clicar no que já está escolhido limpa: é o caminho
                        // pra "prefiro não dizer" sem ter que apagar texto.
                        onClick={() => setPronouns((current) => (current === preset ? '' : preset))}
                      >
                        {preset}
                      </Chip>
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
                  <StatusComposer id="p-status" value={customStatus} onChange={setCustomStatus} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="p-bio">Bio</Label>
                  <textarea
                    id="p-bio"
                    value={bio}
                    maxLength={300}
                    rows={4}
                    onChange={(e) => setBio(e.target.value)}
                    className="input-terminal w-full resize-none rounded-brutal p-3 text-sm leading-relaxed"
                  />
                  <p className="text-right font-mono text-[11.5px] tabular-nums text-muted-foreground">
                    {bio.length}/300
                  </p>
                </div>
              </TabsContent>

              {/* -------------------------------------------------- ESTILO */}
              <TabsContent value="estilo" className="pr-1">
                <StyleTab me={user} onOpenShop={goToShop} />
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
                      <Hint label="Limpar aniversário">
                        <button
                          type="button"
                          aria-label="Limpar aniversário"
                          onClick={() => {
                            setBirthMonth('')
                            setBirthDay('')
                          }}
                          className="shrink-0 rounded-brutal p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </Hint>
                    )}
                  </div>
                  <p className="text-[11.5px] text-muted-foreground">
                    Sem ano — só o dia, pra galera lembrar.
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
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0"
                      onClick={() => setTimezone(detectTimezone())}
                    >
                      Usar o meu
                    </Button>
                  </div>
                  <p className="text-[11.5px] text-muted-foreground">
                    {timezone
                      ? `Agora são ${localTimeIn(timezone) ?? '--:--'} pra você.`
                      : 'Aparece no seu perfil como "que horas são pra essa pessoa".'}
                  </p>
                </div>

                {/* Jogos */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Jogos que você joga</Label>
                    <span className="font-mono text-[11.5px] tabular-nums text-muted-foreground">
                      {games.length}/{MAX_GAMES}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {GAME_CATALOG.map((game) => {
                      const on = games.includes(game.key)
                      return (
                        <Chip
                          key={game.key}
                          on={on}
                          disabled={!on && games.length >= MAX_GAMES}
                          onClick={() => toggleGame(game.key)}
                        >
                          <GameIcon game={game.key} className="h-3.5 w-3.5" />
                          {game.label}
                        </Chip>
                      )
                    })}
                  </div>

                  {/* Jogos digitados na mão, que não estão na lista de cima. */}
                  {games.filter((g) => !GAME_CATALOG.some((c) => c.key === g)).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {games
                        .filter((g) => !GAME_CATALOG.some((c) => c.key === g))
                        .map((game) => (
                          <Chip key={game} on onClick={() => toggleGame(game)} title="Tirar da lista">
                            <BocasGameIcon className="h-3.5 w-3.5" />
                            {gameLabel(game)}
                            <X className="h-3 w-3" />
                          </Chip>
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
                        className="h-9 flex-1 text-sm"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 shrink-0 px-2.5"
                        onClick={addGameDraft}
                        disabled={!gameDraft.trim()}
                        aria-label="Adicionar jogo"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Links */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Links</Label>
                    {links.length < MAX_LINKS && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setLinks((prev) => [...prev, { name: '', url: '' }])}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Adicionar
                      </Button>
                    )}
                  </div>

                  {links.length === 0 ? (
                    <p className="text-[11.5px] text-muted-foreground">
                      Nenhum link. Twitch, op.gg, Steam — o que a galera precisa achar.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {links.map((link, index) => (
                        <div key={index} className="flex items-center gap-1.5">
                          <LinkIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <Input
                            value={link.name}
                            placeholder="Nome"
                            maxLength={32}
                            onChange={(e) => updateLink(index, { name: e.target.value })}
                            className="h-9 w-32 text-sm"
                          />
                          <Input
                            value={link.url}
                            placeholder="https://…"
                            onChange={(e) => updateLink(index, { url: e.target.value })}
                            className="h-9 flex-1 text-sm"
                          />
                          <Hint label="Tirar link">
                            <button
                              type="button"
                              aria-label="Tirar link"
                              onClick={() => setLinks((prev) => prev.filter((_, i) => i !== index))}
                              className="shrink-0 rounded-brutal p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </Hint>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11.5px] text-muted-foreground">
                    Só http(s) · máximo {MAX_LINKS}
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
// CHIP (pronome, jogo)
// ============================================

/**
 * Botão de alternar em caixa normal. Os antigos eram mono caixa-alta
 * espaçada — o idioma de RÓTULO do design system, não de botão (ver
 * .design-sync/conventions.md).
 */
function Chip({
  on,
  disabled,
  onClick,
  title,
  children
}: {
  on: boolean
  disabled?: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={on}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-brutal border px-2.5 py-1 text-xs font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        on
          ? 'border-acid bg-acid/10 text-acid'
          : 'border-line text-muted-foreground hover:border-acid/50 hover:text-foreground disabled:hover:border-line disabled:hover:text-muted-foreground'
      )}
    >
      {children}
    </button>
  )
}

// ============================================
// FOTO E CAPA (sobre a prévia)
// ============================================

/**
 * Os botões de trocar foto/capa, desenhados EM CIMA da prévia. Fundo próprio
 * com desfoque porque ficam sobre a capa, que pode ser qualquer imagem.
 */
function MediaControls({
  kind,
  hasValue,
  working,
  onFile,
  onGif,
  onClear,
  className
}: {
  kind: 'avatar' | 'banner'
  hasValue: boolean
  working: boolean
  onFile: (file: File | null) => void
  onGif: () => void
  onClear: () => void
  className?: string
}) {
  const noun = kind === 'avatar' ? 'foto' : 'capa'
  const hint = kind === 'avatar' ? 'quadrada · até 4 MB · GIF vale' : 'deitada · até 4 MB · GIF vale'
  const base =
    'flex h-8 items-center gap-1.5 rounded-brutal border border-line-strong bg-void/80 px-2.5 text-xs font-medium text-foreground backdrop-blur-sm transition-colors hover:border-acid/60 hover:text-acid'

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {working && <Loader2 className="mr-1 h-4 w-4 animate-spin text-foreground" />}
      <Hint label={`Trocar ${noun}`} description={hint}>
        <label className={cn(base, 'cursor-pointer')}>
          <Upload className="h-3.5 w-3.5" />
          {kind === 'avatar' ? 'Foto' : 'Capa'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </Hint>
      <Hint label={`${kind === 'avatar' ? 'Foto' : 'Capa'} em GIF`} description="Buscar no Giphy ou colar um link">
        <button type="button" onClick={onGif} aria-label={`Escolher GIF pra ${noun}`} className={base}>
          <ImagePlus className="h-3.5 w-3.5" />
          GIF
        </button>
      </Hint>
      {hasValue && (
        <Hint label={`Remover ${noun}`}>
          <button
            type="button"
            onClick={onClear}
            aria-label={`Remover ${noun}`}
            className={cn(base, 'w-8 justify-center px-0 hover:border-destructive/60 hover:text-destructive')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </Hint>
      )}
    </div>
  )
}

// ============================================
// ESTILO (o que a pessoa tem da Lojinha)
// ============================================

const SLOTS: { type: CosmeticType; label: string; hint: string }[] = [
  { type: 'nameColor', label: 'Cor do nome', hint: 'pinta seu nome e a capa sem imagem' },
  { type: 'title', label: 'Título', hint: 'a etiqueta do lado do seu nome' },
  { type: 'nameEffect', label: 'Efeito do nome', hint: 'brilho, gelo, fogo…' },
  { type: 'avatarFrame', label: 'Moldura', hint: 'em volta da sua foto, também na call' },
  { type: 'emoji', label: 'Emoji', hint: 'do lado do nome, em todo canto' },
  { type: 'joinSound', label: 'Som de entrada', hint: 'todo mundo ouve quando você entra na call' },
  // Tema por último: é o único que só VOCÊ vê — os outros são pros outros.
  { type: 'theme', label: 'Tema do launcher', hint: 'as cores do app inteiro, só nesta máquina' }
]

/** Hex de um item de cor (`data.color`), ou null. */
function colorOf(item: Pick<ShopItem, 'type' | 'data'>): string | null {
  if (item.type !== 'nameColor') return null
  const hex = item.data?.color
  return typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex) ? hex : null
}

/**
 * O id equipado num slot, lido do usuário (que é a verdade; a lojinha só
 * espelha). Tema é a exceção: a verdade é `settings.theme`, desta máquina.
 */
function equippedOf(user: AuthUser | null, type: CosmeticType, items: ShopItem[], theme: ThemeId): string | null {
  if (!user) return null
  switch (type) {
    case 'title':
      return user.title ?? null
    case 'nameEffect':
      return user.nameEffect ?? null
    case 'avatarFrame':
      return user.avatarFrame ?? null
    case 'emoji':
      return user.emoji ?? null
    case 'joinSound':
      return user.joinSound ?? null
    case 'nameColor': {
      const current = (user.profileColor ?? '').toLowerCase()
      return items.find((i) => (colorOf(i) ?? '').toLowerCase() === current)?.id ?? null
    }
    case 'theme':
      return items.find((i) => cosmeticTheme(i) === theme)?.id ?? null
  }
}

function StyleTab({ me, onOpenShop }: { me: AuthUser | null; onOpenShop: () => void }) {
  const { shop, loadShop, equip } = useGamification()
  const { settings, update: updateSettings } = useSettings()
  const [loading, setLoading] = React.useState(!shop)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  // `loadShop` devolve null quando falha (não lança): sem isto a aba dizia
  // "você ainda não tem nada pra vestir" pra quem tem, só porque não carregou.
  const [failed, setFailed] = React.useState(false)
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    if (shop) return
    let alive = true
    setLoading(true)
    setFailed(false)
    void loadShop()
      .then((res) => {
        if (alive && !res) setFailed(true)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [shop, loadShop, attempt])

  const items = shop?.items ?? []
  const owned = items.filter((i) => i.owned)
  const missing = items.length - owned.length
  // Mesma regra da lojinha: a prévia do som respeita o volume dos avisos de voz.
  const previewVolume =
    settings.soundEnabled && settings.voiceCueVolume > 0 ? settings.voiceCueVolume : 0.4

  const run = async (key: string, action: () => Promise<void>): Promise<void> => {
    setBusy(key)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu pra equipar agora.')
    } finally {
      setBusy(null)
    }
  }

  // Tema é configuração local, não slot no servidor; "tirar" volta pro padrão.
  const setSlot = (type: CosmeticType, item: ShopItem | null): Promise<void> =>
    run(item?.id ?? `${type}:none`, () =>
      type === 'theme'
        ? updateSettings({ theme: (item && cosmeticTheme(item)) ?? DEFAULT_SETTINGS.theme })
        : equip(type, item?.id ?? null)
    )

  if (loading && !shop) {
    return (
      <div className="flex h-32 items-center justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }

  if (failed && !shop) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-brutal border border-dashed border-line px-4 py-5">
        <p className="text-sm text-destructive">Não deu pra carregar o que você tem da Lojinha.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
          Tentar de novo
        </Button>
      </div>
    )
  }

  if (owned.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-brutal border border-dashed border-line px-4 py-5">
        <p className="text-sm text-foreground">Você ainda não tem nada pra vestir.</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Tema do launcher, cor do nome, título, efeito, moldura, emoji e som de entrada são
          itens da Lojinha, pagos em murchos. O que você comprar aparece aqui pra equipar.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onOpenShop}>
          <ShopIcon className="mr-1.5 h-3.5 w-3.5" />
          Abrir a Lojinha
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-muted-foreground">
        Tudo aqui é seu, comprado na Lojinha. Equipar salva na hora — e aparece na prévia.
      </p>

      {SLOTS.map((slot) => {
        const mine = owned.filter((i) => i.type === slot.type)
        if (mine.length === 0) return null
        const equippedId = equippedOf(me, slot.type, mine, settings.theme)
        return (
          <section key={slot.type} className="flex flex-col gap-2">
            <div className="flex items-end justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  {slot.label}
                </h3>
                <p className="text-[11px] text-muted-foreground">{slot.hint}</p>
              </div>
              {equippedId && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void setSlot(slot.type, null)}
                  className="text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                >
                  tirar
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {mine.map((item) => (
                <StyleTile
                  key={item.id}
                  item={item}
                  on={item.id === equippedId}
                  busy={busy === item.id}
                  disabled={busy !== null}
                  me={{
                    name: me?.displayName ?? '??',
                    avatar: resolveAssetUrl(me?.avatar),
                    color: me?.profileColor ?? null
                  }}
                  onToggle={() => void setSlot(slot.type, item.id === equippedId ? null : item)}
                  onPreviewSound={
                    item.type === 'joinSound'
                      ? (phase) => playJoinSound(cosmeticSound(item), phase, previewVolume)
                      : undefined
                  }
                />
              ))}
            </div>
          </section>
        )
      })}

      {error && (
        <p className="rounded-brutal border border-destructive/50 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 rounded-brutal border border-line bg-void/60 px-3 py-2">
        <p className="text-xs text-muted-foreground">
          {missing > 0
            ? `Tem mais ${missing} ${missing === 1 ? 'item' : 'itens'} na Lojinha que você ainda não tem.`
            : 'Você tem tudo que a Lojinha vende. Respeito.'}
        </p>
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onOpenShop}>
          <ShopIcon className="mr-1.5 h-3.5 w-3.5" />
          Lojinha
        </Button>
      </div>
    </div>
  )
}

/**
 * Um item vestível: amostra do jeito que aparece + equipar. A borda é da
 * raridade; equipado troca pra verde, porque aí o que importa é o estado.
 */
function StyleTile({
  item,
  on,
  busy,
  disabled,
  me,
  onToggle,
  onPreviewSound
}: {
  item: ShopItem
  on: boolean
  busy: boolean
  disabled: boolean
  me: { name: string; avatar?: string; color: string | null }
  onToggle: () => void
  onPreviewSound?: (phase: 'join' | 'leave') => void
}) {
  const tier: Rarity = (item.rarity as Rarity) in RARITY_COLOR ? (item.rarity as Rarity) : 'common'
  const rarityColor = RARITY_COLOR[tier]
  const hex = colorOf(item)

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2.5 rounded-brutal border bg-void/60 py-1.5 pl-2.5 pr-1.5 transition-colors',
        on ? 'border-acid' : 'hover:border-line-strong'
      )}
      style={on ? undefined : { borderColor: `${rarityColor}55` }}
    >
      {/* Amostra */}
      <Hint label={item.name} description={`${RARITY_LABEL[tier]}${item.description ? ` · ${item.description}` : ''}`}>
        <span className="flex min-w-0 items-center gap-2">
          {item.type === 'nameColor' && hex && (
            <>
              <span
                aria-hidden
                className="h-5 w-5 shrink-0 rounded-full border border-line-strong"
                style={{ background: hex }}
              />
              <span className="truncate text-sm font-medium" style={{ color: hex }}>
                {item.name}
              </span>
            </>
          )}
          {item.type === 'title' && (
            <TitleTag titleId={item.id} name={item.name} tooltip={item.name} className="px-1.5 text-xs leading-5" />
          )}
          {item.type === 'nameEffect' && (
            <span
              className="truncate font-display text-base leading-none"
              style={me.color ? { color: me.color } : undefined}
            >
              <NameEffect effect={item.id} color={me.color}>{me.name}</NameEffect>
            </span>
          )}
          {item.type === 'avatarFrame' && (
            <>
              <UserAvatar src={me.avatar} name={me.name} frame={item.id} frameColor={me.color} className="h-8 w-8 border-2" />
              <span className="truncate text-sm">{item.name}</span>
            </>
          )}
          {item.type === 'emoji' && (
            <>
              <NameEmoji glyph={cosmeticEmoji(item)} className="text-xl" />
              <span className="truncate text-sm">{item.name}</span>
            </>
          )}
          {item.type === 'joinSound' && <span className="truncate text-sm">{item.name}</span>}
          {item.type === 'theme' && (
            <>
              {cosmeticTheme(item) && <ThemeSwatch theme={cosmeticTheme(item)!} className="h-7 w-12 shrink-0" />}
              <span className="truncate text-sm">{item.name}</span>
            </>
          )}
        </span>
      </Hint>

      {onPreviewSound && (
        <span className="flex shrink-0 items-center gap-0.5">
          <Hint label="Ouvir: entrou">
            <button
              type="button"
              aria-label="Ouvir o som de entrar"
              onClick={() => onPreviewSound('join')}
              className="rounded-brutal p-1 text-muted-foreground transition-colors hover:text-acid"
            >
              <Play className="h-3 w-3" />
            </button>
          </Hint>
        </span>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        aria-pressed={on}
        className={cn(
          'ml-auto flex h-7 shrink-0 items-center gap-1 rounded-brutal border px-2 text-[11.5px] font-semibold transition-colors disabled:opacity-50',
          on
            ? 'border-acid/60 bg-acid/10 text-acid hover:bg-acid/20'
            : 'border-line-strong text-foreground hover:border-acid/60 hover:text-acid'
        )}
        title={on ? 'Clique pra tirar' : 'Equipar'}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : on ? <Check className="h-3 w-3" /> : null}
        {on ? 'Equipado' : 'Equipar'}
      </button>
    </div>
  )
}
