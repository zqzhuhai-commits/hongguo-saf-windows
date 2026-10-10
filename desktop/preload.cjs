// SPDX-License-Identifier: GPL-3.0-only
const {contextBridge,ipcRenderer}=require('electron');
const invoke=name=>async(...args)=>{const result=await ipcRenderer.invoke('desktop:'+name,...args);if(!result.ok)throw new Error(result.error);return result.value;};
contextBridge.exposeInMainWorld('desktop',{
  boot:invoke('boot'),catalog:invoke('catalog'),detail:invoke('detail'),play:invoke('play'),toggle:invoke('toggle'),progress:invoke('progress'),settings:invoke('settings'),removeHistory:invoke('remove-history'),exportBackup:invoke('export'),importBackup:invoke('import'),fullscreen:invoke('fullscreen')
});
