export interface MinecraftProfile {
  id: string
  name: string
}

export interface MinecraftSession {
  accessToken: string
  expiresAt: number
  profile: MinecraftProfile
}

export class MinecraftAuthError extends Error {
  constructor(message: string, public code?: string) {
    super(message)
    this.name = 'MinecraftAuthError'
  }
}

interface XblResponse {
  Token: string
  DisplayClaims: {
    xui: Array<{ uhs: string }>
  }
}

async function authenticateXbox(msAccessToken: string): Promise<{ token: string; userHash: string }> {
  console.log('[mc-auth] STEP 1 → Xbox Live authenticate')
  const res = await fetch('https://user.auth.xboxlive.com/user/authenticate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${msAccessToken}`
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    })
  })
  const raw = await res.text()
  console.log(`[mc-auth] XBL status=${res.status} body=`, raw.slice(0, 400))
  if (!res.ok) {
    throw new MinecraftAuthError(`Xbox Live authentication failed: HTTP ${res.status} — ${raw.slice(0, 200)}`, 'XBL_FAILED')
  }
  const data = JSON.parse(raw) as XblResponse
  return {
    token: data.Token,
    userHash: data.DisplayClaims.xui[0]?.uhs ?? ''
  }
}

interface XstsErrorBody {
  XErr?: number
  Message?: string
  Redirect?: string
}

async function authorizeXsts(xblToken: string): Promise<{ token: string; userHash: string }> {
  console.log('[mc-auth] STEP 2 → XSTS authorize')
  const res = await fetch('https://xsts.auth.xboxlive.com/xsts/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      Properties: {
        SandboxId: 'RETAIL',
        UserTokens: [xblToken]
      },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    })
  })
  console.log(`[mc-auth] XSTS status=${res.status}`)

  if (res.status === 401) {
    const body = (await res.json().catch(() => ({}))) as XstsErrorBody
    const map: Record<number, string> = {
      2148916233: 'Esta conta Microsoft não tem perfil Xbox. Crie um em xbox.com e tente novamente.',
      2148916235: 'Xbox Live não está disponível no seu país/região.',
      2148916236: 'Conta requer verificação adicional (autenticação em duas etapas).',
      2148916237: 'Conta requer verificação adicional.',
      2148916238: 'Conta infantil — precisa ser adicionada a uma Family pelo responsável.'
    }
    const reason = body.XErr ? map[body.XErr] : undefined
    throw new MinecraftAuthError(reason || body.Message || 'Xbox XSTS retornou 401', `XSTS_${body.XErr ?? 'UNKNOWN'}`)
  }

  if (!res.ok) {
    const raw = await res.text()
    console.log('[mc-auth] XSTS error body=', raw.slice(0, 400))
    throw new MinecraftAuthError(`XSTS authorization failed: HTTP ${res.status} — ${raw.slice(0, 200)}`, 'XSTS_FAILED')
  }

  const data = (await res.json()) as XblResponse
  return {
    token: data.Token,
    userHash: data.DisplayClaims.xui[0]?.uhs ?? ''
  }
}

interface McLoginResponse {
  access_token: string
  expires_in: number
}

async function loginWithXbox(userHash: string, xstsToken: string): Promise<{ accessToken: string; expiresAt: number }> {
  console.log('[mc-auth] STEP 3 → login_with_xbox')
  const res = await fetch('https://api.minecraftservices.com/authentication/login_with_xbox', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ identityToken: `XBL3.0 x=${userHash};${xstsToken}` })
  })
  const raw = await res.text()
  console.log(`[mc-auth] MC-login status=${res.status} body=`, raw.slice(0, 400))
  if (!res.ok) {
    throw new MinecraftAuthError(`Minecraft login failed: HTTP ${res.status} — ${raw.slice(0, 200)}`, 'MC_LOGIN_FAILED')
  }
  const data = JSON.parse(raw) as McLoginResponse
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000
  }
}

interface McProfileResponse {
  id: string
  name: string
}

async function fetchMinecraftProfile(accessToken: string): Promise<MinecraftProfile> {
  console.log('[mc-auth] STEP 4 → fetch MC profile')
  const res = await fetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  const raw = await res.text()
  console.log(`[mc-auth] MC-profile status=${res.status} body=`, raw.slice(0, 400))
  if (res.status === 404) {
    throw new MinecraftAuthError(
      'Esta conta Microsoft não tem Minecraft Java Edition. Verifique a compra em minecraft.net.',
      'NO_MINECRAFT'
    )
  }
  if (!res.ok) {
    throw new MinecraftAuthError(`Falha ao buscar perfil: HTTP ${res.status} — ${raw.slice(0, 200)}`, 'PROFILE_FAILED')
  }
  return JSON.parse(raw) as McProfileResponse
}

export async function buildMinecraftSession(msAccessToken: string): Promise<MinecraftSession> {
  const xbl = await authenticateXbox(msAccessToken)
  const xsts = await authorizeXsts(xbl.token)
  const mc = await loginWithXbox(xsts.userHash, xsts.token)
  const profile = await fetchMinecraftProfile(mc.accessToken)
  return {
    accessToken: mc.accessToken,
    expiresAt: mc.expiresAt,
    profile
  }
}
