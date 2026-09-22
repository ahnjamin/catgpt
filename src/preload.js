'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nyangi', {
  // 창 클릭 통과 제어
  setInteractive: (v) => ipcRenderer.send('pet:set-interactive', !!v),
  focusWindow: () => ipcRenderer.send('pet:focus'),

  // 설정
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  testKey: (key) => ipcRenderer.invoke('settings:test-key', key),
  openSettings: () => ipcRenderer.invoke('settings:open-window'),
  onSettingsChanged: (cb) => ipcRenderer.on('settings:changed', (_e, s) => cb(s)),

  // AI
  hasKey: () => ipcRenderer.invoke('ai:has-key'),
  wakeCheck: (payload) => ipcRenderer.invoke('ai:wake-check', payload),
  askAudio: (payload) => ipcRenderer.invoke('ai:ask-audio', payload),
  askText: (payload) => ipcRenderer.invoke('ai:ask-text', payload),

  // 기타
  onSummon: (cb) => ipcRenderer.on('pet:summon', () => cb()),
  onRepeat: (cb) => ipcRenderer.on('pet:repeat', () => cb()),
  onCursor: (cb) => ipcRenderer.on('pet:cursor', (_e, p) => cb(p)),
  onBlur: (cb) => ipcRenderer.on('pet:blur', () => cb()),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  quit: () => ipcRenderer.invoke('app:quit')
});
