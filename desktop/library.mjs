// SPDX-License-Identifier: GPL-3.0-only
import fs from 'node:fs';
import path from 'node:path';
export const defaults = () => ({format:'hongguotv.library',version:1,createdAt:Date.now(),favorites:[],history:[],later:[],hidden:[],watched:[],searches:[],settings:{quality:720,speed:1,autoNext:true,type:'comic',frame:'FIT'}});
const id = value => {if (typeof value!=='string' || !/^\d{1,30}$/.test(value)) throw new Error('剧集标识无效'); return value;};
const text = (value,max) => String(value || '').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,max);
export function cleanSeries(value) {
  if (!value || typeof value!=='object') throw new Error('剧集记录无效');
  let cover = text(value.cover,2048);
  try {const u=new URL(cover); if(u.protocol!=='https:' || u.username || u.password || /^(localhost|[\d.]+)$/.test(u.hostname) || /\.(local|lan)$/.test(u.hostname) || u.hostname.includes(':')) cover='';} catch {cover='';}
  const title = text(value.title,200);
  if (!title.trim()) throw new Error('剧名不能为空');
  return {id:id(value.id),title,cover,description:'',badge:text(value.badge,100),tags:text(value.tags,200)};
}
export function cleanSettings(value) {
  const base = defaults().settings;
  if (!value || typeof value!=='object') return base;
  return {quality:[480,720,1080].includes(value.quality)?value.quality:base.quality,
    speed:[0.75,1,1.25,1.5,1.75,2].includes(value.speed)?value.speed:1,
    autoNext:typeof value.autoNext==='boolean'?value.autoNext:true,
    type:value.type==='short'?'short':'comic', frame:['FIT','FILL','STRETCH'].includes(value.frame)?value.frame:'FIT'};
}
function rows(value,key,max,mapper) {
  const list = value[key] || [];
  if(!Array.isArray(list) || list.length>max) throw new Error('记录数量超过上限');
  return list.map(mapper);
}
function number(value,max) {if(!Number.isSafeInteger(value) || value<0 || value>max) throw new Error('播放记录数值无效'); return value;}
export function validateBackup(raw) {
  if(typeof raw!=='string' || Buffer.byteLength(raw)>2*1024*1024) throw new Error('备份文件超过 2 MB');
  const value = JSON.parse(raw);
  if(value?.format!=='hongguotv.library' || value.version!==1) throw new Error('不支持的备份格式');
  const out = defaults();
  out.favorites=rows(value,'favorites',500,cleanSeries); out.later=rows(value,'later',100,cleanSeries);
  out.hidden=rows(value,'hidden',500,id); out.watched=rows(value,'watched',500,id);
  out.history=rows(value,'history',200,row => {
    const duration=number(row.duration,604800000), position=number(row.position,604800000);
    if(typeof row.completed!=='boolean') throw new Error('观看状态无效');
    return {series:cleanSeries(row.series),episodeId:id(row.episodeId),episodeIndex:number(row.episodeIndex,100000),position:duration?Math.min(position,duration):position,duration,completed:row.completed,updatedAt:number(row.updatedAt,4102444800000)};
  });
  out.searches=rows(value,'searches',20,row => {if(!['short','comic'].includes(row.type) || !text(row.query,80).trim()) throw new Error('搜索记录无效'); return {query:text(row.query,80),type:row.type};});
  out.settings=cleanSettings(value.settings);
  for(const key of ['favorites','later','history']) {const ids=out[key].map(row=>key==='history'?row.series.id:row.id); if(new Set(ids).size!==ids.length) throw new Error('备份包含重复剧集');}
  return out;
}
export function mergeBackup(local,incoming,restoreSettings=false) {
  const out={...local};
  out.favorites=[...new Map([...local.favorites,...incoming.favorites].reverse().map(row=>[row.id,row])).values()].reverse().slice(0,500);
  out.later=[...new Map([...local.later,...incoming.later].reverse().map(row=>[row.id,row])).values()].reverse().slice(0,100);
  const history=new Map(local.history.map(row=>[row.series.id,row]));
  for(const row of incoming.history) if(!history.has(row.series.id) || row.updatedAt>history.get(row.series.id).updatedAt) history.set(row.series.id,row);
  out.history=[...history.values()].sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,200);
  out.hidden=[...new Set([...local.hidden,...incoming.hidden])].slice(0,500);
  out.watched=[...new Set([...local.watched,...incoming.watched])].slice(0,500);
  out.searches=[...new Map([...local.searches,...incoming.searches].reverse().map(row=>[row.type+'|'+row.query,row])).values()].reverse().slice(0,20);
  if(restoreSettings) out.settings=incoming.settings;
  return out;
}

export class Library {
  constructor(directory) {
    this.file=path.join(directory,'library.json'); this.value=defaults();
    fs.mkdirSync(directory,{recursive:true});
    if(fs.existsSync(this.file)) {
      try {this.value=validateBackup(fs.readFileSync(this.file,'utf8'));}
      catch {this.loadError='本地记录文件损坏，已保留原文件。请从备份恢复。'; fs.copyFileSync(this.file,this.file+'.damaged-'+Date.now());}
    }
  }
  save() {this.value.createdAt=Date.now(); const temp=this.file+'.tmp'; fs.writeFileSync(temp,JSON.stringify(this.value),'utf8'); fs.renameSync(temp,this.file); return this.value;}
  toggle(kind,series) {
    if(!['favorites','later'].includes(kind)) throw new Error('片单类型无效');
    const clean=cleanSeries(series), list=this.value[kind], index=list.findIndex(row=>row.id===clean.id);
    if(index>=0) list.splice(index,1);
    else {if(list.length>=(kind==='favorites'?500:100)) throw new Error('片单已达数量上限'); list.unshift(clean);}
    return this.save();
  }
  progress(row) {
    const clean=validateBackup(JSON.stringify({...defaults(),history:[row]})).history[0];
    this.value.history=[clean,...this.value.history.filter(r=>r.series.id!==clean.series.id)].slice(0,200);
    return this.save();
  }
  search(query,type) {const row={query:text(query,80),type:type==='short'?'short':'comic'}; this.value.searches=[row,...this.value.searches.filter(r=>r.query!==row.query || r.type!==row.type)].slice(0,20); return this.save();}
  settings(value) {this.value.settings=cleanSettings({...this.value.settings,...value}); return this.save();}
  removeHistory(seriesId) {id(seriesId); this.value.history=this.value.history.filter(row=>row.series.id!==seriesId); return this.save();}
  import(value,restoreSettings) {this.value=mergeBackup(this.value,validateBackup(value),restoreSettings); return this.save();}
}
