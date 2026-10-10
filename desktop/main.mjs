// SPDX-License-Identifier: GPL-3.0-only
import {app,BrowserWindow,ipcMain,dialog,Menu} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {provider} from './provider.mjs';
import {startMediaServer} from './media.mjs';
import {Library,validateBackup} from './library.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
// Retain the previous release's data directory after changing the product name.
const dataDirectory=path.join(app.getPath('appData'),'HongguoTV');
fs.mkdirSync(dataDirectory,{recursive:true});
app.setPath('userData',dataDirectory);
let window,media,library;
if(!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore(); window.focus();}});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',()=>media?.close());
  app.whenReady().then(async()=>{
    app.setName('红果短剧Win客户端SAF版');
    library=new Library(app.getPath('userData'));
    media=await startMediaServer(provider);
    Menu.setApplicationMenu(null);
    window=new BrowserWindow({width:1280,height:840,minWidth:940,minHeight:640,title:'红果短剧Win客户端SAF版',backgroundColor:'#101218',autoHideMenuBar:true,icon:path.join(here,'assets/app.png'),
      webPreferences:{preload:path.join(here,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
    const trusted=event=>event.sender===window?.webContents && event.senderFrame===window.webContents.mainFrame;
    const handle=(name,fn)=>ipcMain.handle(name,async(event,...args)=>{
      if(!trusted(event))throw new Error('无效请求');
      try{return {ok:true,value:await fn(...args)};}catch(e){return {ok:false,error:knownMessage(e)};}
    });
    handle('desktop:boot',()=>({library:library.value,version:app.getVersion(),loadError:library.loadError || ''}));
    let pending=0;
    handle('desktop:catalog',async({mode,page,query,type})=>{
      if(!['home','ranking','search'].includes(mode) || !Number.isInteger(page) || page<1 || page>100 || !['short','comic'].includes(type))throw new Error('列表参数无效');
      if(pending>=6)throw new Error('请求较多，请稍后重试');
      pending++;
      try {
        if(mode==='search') {
          if(typeof query!=='string' || !query.trim() || query.length>80)throw new Error('请输入 1–80 字的关键词');
          const result=await provider.search(query.trim(),page,type);
          library.search(query.trim(),type); return {result,library:library.value};
        }
        return {result:await provider.home(page,mode==='ranking'?'comic':type),library:library.value};
      }finally{pending--;}
    });
    handle('desktop:detail',id=>provider.detail(id));
    handle('desktop:play',async({id,quality,fresh})=>{
      if(![480,720,1080].includes(quality))throw new Error('清晰度无效');
      const stream=await provider.stream(id,quality,!!fresh);
      return {url:media.url(id,quality),quality:stream.quality,codec:stream.codec};
    });
    handle('desktop:toggle',({kind,series})=>library.toggle(kind,series));
    handle('desktop:progress',row=>library.progress(row));
    handle('desktop:settings',value=>library.settings(value));
    handle('desktop:remove-history',id=>library.removeHistory(id));
    handle('desktop:export',async()=>{
      const target=await dialog.showSaveDialog(window,{title:'导出片单与观看记录',defaultPath:'hongguotv-library.json',filters:[{name:'JSON 备份',extensions:['json']}]});
      if(target.canceled)return false;
      fs.writeFileSync(target.filePath,JSON.stringify({...library.value,createdAt:Date.now()},null,2),'utf8'); return true;
    });
    handle('desktop:import',async()=>{
      const source=await dialog.showOpenDialog(window,{title:'恢复片单与观看记录',properties:['openFile'],filters:[{name:'JSON 备份',extensions:['json']}]});
      if(source.canceled)return null;
      const file=source.filePaths[0];if(fs.statSync(file).size>2*1024*1024)throw new Error('备份文件超过 2 MB');
      const raw=fs.readFileSync(file,'utf8'), incoming=validateBackup(raw);
      const choice=await dialog.showMessageBox(window,{type:'question',title:'导入备份',message:`备份中有 ${incoming.favorites.length} 部收藏、${incoming.history.length} 条观看记录。`,detail:'记录将与本机合并，较新的观看进度优先。可选择同时恢复播放偏好。',buttons:['仅合并记录','记录和播放偏好','取消'],defaultId:0,cancelId:2});
      return choice.response===2?null:library.import(raw,choice.response===1);
    });
    handle('desktop:fullscreen',()=>{window.setFullScreen(!window.isFullScreen());return window.isFullScreen();});
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',event=>event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
    await window.loadFile(path.join(here,'ui/index.html'));
  }).catch(()=>{dialog.showErrorBox('启动失败','桌面版无法启动，请确认文件完整且用户目录可写。');app.quit();});
}
function knownMessage(error) {
  // Do not disclose upstream signed URLs, request objects or credential material.
  const text=String(error?.message || '');
  if(/^[\u3400-\u9fff]/.test(text) && !/https?:|[\r\n]/.test(text) && text.length<180)return text;
  if(error?.code==='ENOSPC')return '磁盘空间不足，无法保存记录';
  if(['EACCES','EPERM'].includes(error?.code))return '目录无法写入，请检查文件权限';
  return '内容源或网络暂不可用，请稍后重试';
}
