// DOM-flow tests use explicitly labelled fixtures, not real content or video decoding.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {JSDOM} from 'jsdom';
import {Library} from '../library.mjs';
const html=fs.readFileSync(new URL('../ui/index.html',import.meta.url),'utf8');
const script=fs.readFileSync(new URL('../ui/app.js',import.meta.url),'utf8');
const series={id:'123',title:'测试故事 <script>alert(1)</script>',cover:'',description:'明确标记的界面测试夹具',badge:'全 2 集',tags:'测试'};
const episodes=[{id:'456',number:1,title:'第 1 集'},{id:'457',number:2,title:'第 2 集'}];
const settle=async()=>{for(let n=0;n<8;n++)await new Promise(resolve=>setImmediate(resolve));};
async function fixture(t,overrides={}) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hongguotv-renderer-'));
  const library=new Library(directory),calls=[];
  const dom=new JSDOM(html,{url:'file:///desktop/ui/index.html',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document;
  w.scrollTo=()=>{};w.Element.prototype.scrollIntoView=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  const video=d.querySelector('#video');let ready=0,paused=true,ended=false,current=0;
  Object.defineProperties(video,{readyState:{get:()=>ready},duration:{get:()=>60},currentTime:{get:()=>current,set:value=>{current=value;}},paused:{get:()=>paused},ended:{get:()=>ended}});
  video.load=()=>{ready=0;current=0;ended=false;};
  video.pause=()=>{if(!paused){paused=true;video.dispatchEvent(new w.Event('pause'));}};
  video.play=async()=>{paused=false;video.dispatchEvent(new w.Event('playing'));};
  w.desktop={
    boot:async()=>({library:library.value,version:'0.8.0-test'}),
    catalog:async args=>{calls.push(args);return {result:{items:[series],page:args.page,hasMore:args.page<2,totalPages:2},library:library.value};},
    detail:async()=>({...series,episodes}),play:async args=>{calls.push({play:args});return {url:`http://127.0.0.1:12345/sample/${args.id}`,quality:'720P',codec:'avc'};},
    toggle:async({kind,series})=>library.toggle(kind,series),progress:async row=>library.progress(row),settings:async value=>library.settings(value),removeHistory:async id=>library.removeHistory(id),
    exportBackup:async()=>true,importBackup:async()=>null,fullscreen:async()=>false,...overrides
  };
  w.eval(script);await settle();
  t.after(()=>{dom.window.close();fs.rmSync(directory,{recursive:true,force:true});});
  return {w,d,library,calls,video,click:async selector=>{d.querySelector(selector).click();await settle();},loadMedia:async()=>{ready=4;video.dispatchEvent(new w.Event('loadedmetadata'));video.dispatchEvent(new w.Event('loadeddata'));await settle();},finishMedia:async()=>{ended=true;current=60;video.dispatchEvent(new w.Event('ended'));await settle();}};
}
test('renderer escapes source titles and opens real detail/episode controls',async t=>{
  const f=await fixture(t);assert.equal(f.d.querySelector('.card h3').textContent,series.title);assert.equal(f.d.querySelectorAll('#content script').length,0);
  await f.click('[data-action="detail"]');assert.equal(f.d.querySelector('.detail-info h2').textContent,series.title);assert.equal(f.d.querySelectorAll('#detail-content script').length,0);assert.equal(f.d.querySelectorAll('#detail-content [data-action="episode"]').length,2);
  await f.click('[data-action="close-detail"]');assert.equal(f.d.querySelector('#detail-dialog').open,false);
});
test('favorites update in place, persist and remain removable from the collection',async t=>{
  const f=await fixture(t);await f.click('.card [data-action="favorite"]');assert.equal(f.library.value.favorites.length,1);assert.equal(f.d.querySelector('#favorite-count').textContent,'1');
  await f.click('[data-nav="favorites"]');assert.equal(f.d.querySelectorAll('.card').length,1);await f.click('.card [data-action="favorite"]');assert.equal(f.library.value.favorites.length,0);assert.equal(f.d.querySelectorAll('.card').length,0);
});
test('content type, search, pagination and playback preferences reach the desktop API',async t=>{
  const f=await fixture(t);await f.click('[data-type="short"]');assert.equal(f.library.value.settings.type,'short');assert.equal(f.calls.at(-1).type,'short');
  f.d.querySelector('#query').value='测试';f.d.querySelector('#search-form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();assert.equal(f.calls.at(-1).mode,'search');assert.equal(f.calls.at(-1).query,'测试');
  await f.click('[data-action="next"]');assert.equal(f.calls.at(-1).page,2);
  await f.click('[data-nav="settings"]');const speed=f.d.querySelector('[data-setting="speed"]');speed.value='1.5';speed.dispatchEvent(new f.w.Event('change',{bubbles:true}));await settle();assert.equal(f.library.value.settings.speed,1.5);
});
test('changing episodes saves the old episode before resetting the media element',async t=>{
  const f=await fixture(t);await f.click('[data-action="detail"]');await f.click('[data-action="detail-play"]');await f.loadMedia();f.video.currentTime=12;
  await f.click('#next-episode');assert.equal(f.library.value.history[0].episodeId,'456');assert.equal(f.library.value.history[0].position,12000);
  await f.loadMedia();f.video.currentTime=3;await f.click('#close-player');assert.equal(f.library.value.history[0].episodeId,'457');assert.equal(f.library.value.history[0].position,3000);assert.equal(f.d.querySelector('#detail-dialog').open,true);
});
test('end-of-episode timer blocks automatic next-episode playback',async t=>{
  const f=await fixture(t);await f.click('[data-action="detail"]');await f.click('[data-action="detail-play"]');await f.loadMedia();
  const timer=f.d.querySelector('#sleep-timer');timer.value='end';timer.dispatchEvent(new f.w.Event('change',{bubbles:true}));await f.finishMedia();
  assert.equal(f.calls.filter(row=>row.play).length,1);assert.equal(f.library.value.history[0].completed,true);assert.equal(f.d.querySelector('#toast').textContent,'已达到定时停止条件');
});
test('network retry preserves a user pause instead of restarting playback',async t=>{
  const f=await fixture(t);await f.click('[data-action="detail"]');await f.click('[data-action="detail-play"]');await f.loadMedia();
  f.video.currentTime=12;f.video.pause();await settle();
  Object.defineProperty(f.video,'error',{value:{code:2}});f.video.dispatchEvent(new f.w.Event('error'));await settle();await f.loadMedia();
  assert.equal(f.video.paused,true);assert.equal(f.video.currentTime,12);assert.equal(f.calls.filter(row=>row.play).length,2);
});
test('source failures display an error and never substitute a successful empty catalog',async t=>{
  const f=await fixture(t,{catalog:async()=>{throw new Error('内容源暂不可用');}});assert.equal(f.d.querySelectorAll('.card').length,0);assert.match(f.d.querySelector('.empty-state').textContent,/内容源暂不可用/);assert.ok(f.d.querySelector('[data-action="refresh"]'));
});
