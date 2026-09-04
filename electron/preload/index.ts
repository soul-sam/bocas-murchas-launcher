import { contextBridge, ipcRenderer } from 'electron'
import type { BocasAPI } from './types.js'

/** Açúcar pra registrar listener e devolver o unsubscribe. */
function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: BocasAPI = {
  auth: {
    saveToken: (token) => ipcRenderer.invoke('auth:save-token', token),
    loadToken: () => ipcRenderer.invoke('auth:load-token'),
    clearToken: () => ipcRenderer.invoke('auth:clear-token')
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke('shell:open-external', url)
  },
  mcAuth: {
    start: () => ipcRenderer.invoke('mc-auth:start'),
    cancel: () => ipcRenderer.invoke('mc-auth:cancel'),
    getProfile: () => ipcRenderer.invoke('mc-auth:get-profile'),
    logout: () => ipcRenderer.invoke('mc-auth:logout'),
    onProgress: (cb) => on('mc-auth:progress', cb)
  },
  install: {
    start: (options) => ipcRenderer.invoke('install:start', options),
    status: () => ipcRenderer.invoke('install:status'),
    onProgress: (cb) => on('install:progress', cb)
  },
  game: {
    launch: () => ipcRenderer.invoke('game:launch'),
    status: () => ipcRenderer.invoke('game:status'),
    onStatus: (cb) => on('game:status', cb)
  },
  updater: {
    status: () => ipcRenderer.invoke('updater:status'),
    onStatus: (cb) => on('updater:status', cb),
    check: () => ipcRenderer.invoke('updater:check'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install')
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch)
  },
  appWindow: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximizeToggle: () => ipcRenderer.invoke('window:maximize-toggle'),
    close: () => ipcRenderer.invoke('window:close'),
    reload: () => ipcRenderer.invoke('window:reload'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onStateChanged: (cb) => on('window:state', cb)
  },
  serverStatus: {
    get: () => ipcRenderer.invoke('server-status:get'),
    refresh: () => ipcRenderer.invoke('server-status:refresh'),
    onStatus: (cb) => on('server-status:status', cb)
  },
  modpack: {
    changelog: () => ipcRenderer.invoke('modpack:changelog'),
    installedTag: () => ipcRenderer.invoke('modpack:installed-tag')
  },
  hotkeys: {
    set: (bindings) => ipcRenderer.invoke('hotkeys:set', bindings),
    probe: (accelerator) => ipcRenderer.invoke('hotkeys:probe', accelerator),
    clear: () => ipcRenderer.invoke('hotkeys:clear'),
    onTriggered: (cb) => on('hotkey:triggered', cb)
  },
  screen: {
    listSources: () => ipcRenderer.invoke('screen:list-sources'),
    selectSource: (sourceId, withAudio) =>
      ipcRenderer.invoke('screen:select-source', { sourceId, withAudio }),
    cancelSelection: () => ipcRenderer.invoke('screen:cancel-selection')
  },
  nudge: {
    shake: (options) => ipcRenderer.invoke('nudge:shake', options)
  },
  tray: {
    setVoiceState: (state) => ipcRenderer.invoke('tray:set-voice-state', state),
    onCommand: (cb) => on('tray:command', cb)
  },
  notify: {
    show: (payload) => ipcRenderer.invoke('notify:show', payload)
  }
}

contextBridge.exposeInMainWorld('bocas', api)
