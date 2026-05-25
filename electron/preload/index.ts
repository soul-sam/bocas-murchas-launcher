import { contextBridge, ipcRenderer } from 'electron'
import type { BocasAPI } from './types.js'

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
    onProgress: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, event: Parameters<typeof cb>[0]) => cb(event)
      ipcRenderer.on('mc-auth:progress', listener)
      return () => ipcRenderer.removeListener('mc-auth:progress', listener)
    }
  },
  install: {
    start: (options) => ipcRenderer.invoke('install:start', options),
    status: () => ipcRenderer.invoke('install:status'),
    onProgress: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, status: Parameters<typeof cb>[0]) => cb(status)
      ipcRenderer.on('install:progress', listener)
      return () => ipcRenderer.removeListener('install:progress', listener)
    }
  },
  game: {
    launch: () => ipcRenderer.invoke('game:launch'),
    status: () => ipcRenderer.invoke('game:status'),
    onStatus: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, status: Parameters<typeof cb>[0]) => cb(status)
      ipcRenderer.on('game:status', listener)
      return () => ipcRenderer.removeListener('game:status', listener)
    }
  },
  updater: {
    status: () => ipcRenderer.invoke('updater:status'),
    onStatus: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, status: Parameters<typeof cb>[0]) => cb(status)
      ipcRenderer.on('updater:status', listener)
      return () => ipcRenderer.removeListener('updater:status', listener)
    },
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
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onStateChanged: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, state: { maximized: boolean }) => cb(state)
      ipcRenderer.on('window:state', listener)
      return () => ipcRenderer.removeListener('window:state', listener)
    }
  },
  serverStatus: {
    get: () => ipcRenderer.invoke('server-status:get'),
    refresh: () => ipcRenderer.invoke('server-status:refresh'),
    onStatus: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, status: Parameters<typeof cb>[0]) =>
        cb(status)
      ipcRenderer.on('server-status:status', listener)
      return () => ipcRenderer.removeListener('server-status:status', listener)
    }
  },
  modpack: {
    changelog: () => ipcRenderer.invoke('modpack:changelog'),
    installedTag: () => ipcRenderer.invoke('modpack:installed-tag')
  }
}

contextBridge.exposeInMainWorld('bocas', api)
