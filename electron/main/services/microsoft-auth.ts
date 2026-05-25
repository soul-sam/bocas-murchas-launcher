const MS_AUTHORITY = 'https://login.microsoftonline.com/consumers'
const MS_DEVICECODE_URL = `${MS_AUTHORITY}/oauth2/v2.0/devicecode`
const MS_TOKEN_URL = `${MS_AUTHORITY}/oauth2/v2.0/token`
const MS_SCOPE = 'XboxLive.signin offline_access'

export interface MicrosoftTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export class MicrosoftAuthError extends Error {
  constructor(message: string, public code?: string) {
    super(message)
    this.name = 'MicrosoftAuthError'
  }
}

function getClientId(): string {
  const id = import.meta.env.MAIN_VITE_MICROSOFT_CLIENT_ID
  if (!id) {
    throw new MicrosoftAuthError(
      'MAIN_VITE_MICROSOFT_CLIENT_ID não configurado no .env do launcher.',
      'NO_CLIENT_ID'
    )
  }
  return id
}

export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
  message?: string
}

export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const body = new URLSearchParams({
    client_id: getClientId(),
    scope: MS_SCOPE
  })
  const res = await fetch(MS_DEVICECODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  const raw = await res.text()
  if (!res.ok) {
    let parsed: { error?: string; error_description?: string } = {}
    try { parsed = JSON.parse(raw) } catch { /* keep raw */ }
    throw new MicrosoftAuthError(
      parsed.error_description || parsed.error || `devicecode HTTP ${res.status}: ${raw.slice(0, 200)}`,
      parsed.error || `HTTP_${res.status}`
    )
  }
  return JSON.parse(raw) as DeviceCodeResponse
}

export type PollResult =
  | { kind: 'pending' }
  | { kind: 'slow-down' }
  | { kind: 'tokens'; tokens: MicrosoftTokens }

/**
 * Polls /token once with grant_type=device_code. Returns 'pending' while the
 * user hasn't completed login yet, 'slow-down' if Microsoft asks for a longer
 * interval, or 'tokens' on success. Throws on hard failures (expired, denied).
 */
export async function pollDeviceCode(deviceCode: string): Promise<PollResult> {
  const body = new URLSearchParams({
    client_id: getClientId(),
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: deviceCode
  })
  const res = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  const raw = await res.text()
  let parsed: {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }
  try { parsed = JSON.parse(raw) } catch {
    throw new MicrosoftAuthError(`Resposta inválida do /token: ${raw.slice(0, 200)}`, 'BAD_RESPONSE')
  }

  if (res.ok && parsed.access_token && parsed.refresh_token && parsed.expires_in) {
    return {
      kind: 'tokens',
      tokens: {
        accessToken: parsed.access_token,
        refreshToken: parsed.refresh_token,
        expiresAt: Date.now() + parsed.expires_in * 1000
      }
    }
  }

  switch (parsed.error) {
    case 'authorization_pending':
      return { kind: 'pending' }
    case 'slow_down':
      return { kind: 'slow-down' }
    case 'expired_token':
      throw new MicrosoftAuthError('O código expirou. Tente de novo.', 'EXPIRED')
    case 'authorization_declined':
      throw new MicrosoftAuthError('Login negado pelo usuário.', 'DENIED')
    case 'bad_verification_code':
      throw new MicrosoftAuthError('Código inválido (provavelmente reuso após sucesso).', 'BAD_CODE')
    default:
      throw new MicrosoftAuthError(
        parsed.error_description || parsed.error || `HTTP ${res.status}`,
        parsed.error || `HTTP_${res.status}`
      )
  }
}

export async function refreshTokens(refreshToken: string): Promise<MicrosoftTokens> {
  const body = new URLSearchParams({
    client_id: getClientId(),
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: MS_SCOPE
  })
  const res = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  const raw = await res.text()
  let parsed: {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }
  try { parsed = JSON.parse(raw) } catch {
    throw new MicrosoftAuthError(`Resposta inválida do refresh: ${raw.slice(0, 200)}`, 'BAD_RESPONSE')
  }
  if (!res.ok || !parsed.access_token || !parsed.refresh_token || !parsed.expires_in) {
    throw new MicrosoftAuthError(
      parsed.error_description || parsed.error || `Refresh falhou HTTP ${res.status}`,
      parsed.error || `HTTP_${res.status}`
    )
  }
  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token,
    expiresAt: Date.now() + parsed.expires_in * 1000
  }
}
