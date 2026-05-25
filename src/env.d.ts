/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly MAIN_VITE_MICROSOFT_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
