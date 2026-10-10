import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compatibleCrypto,parseComicRanking,repairVideoEntries} from '../provider.mjs';
import {byteRange,startMediaServer} from '../media.mjs';
import {Library,defaults,validateBackup,mergeBackup} from '../library.mjs';
const series={id:'123',title:'测试剧集',cover:'https://example.org/cover.jpg',description:'',badge:'全 2 集',tags:'测试'};
const progress=(updatedAt=1000,position=12000)=>({series,episodeId:'456',episodeIndex:0,position,duration:60000,completed:false,updatedAt});

test('Electron SM3 shim matches OpenSSL for incremental binary input',()=>{
  assert.equal(compatibleCrypto().createHash('sm3').update('abc').digest('hex'),'66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0');
  for(const input of [Buffer.from('abc'),Buffer.alloc(0),crypto.randomBytes(8193)]) {
    const shim=compatibleCrypto().createHash('sm3').update(input.subarray(0,5)).update(input.subarray(5)).digest();
    if(crypto.getHashes().includes('sm3'))assert.deepEqual(shim,crypto.createHash('sm3').update(input).digest());
  }
  assert.equal(compatibleCrypto().createHash('sha512').update('abc').digest('hex'),crypto.createHash('sha512').update('abc').digest('hex'));
});
test('range validation rejects multipart, overflow and invalid suffix ranges',()=>{
  assert.deepEqual(byteRange('bytes=17-',100),[17,99]); assert.deepEqual(byteRange('bytes=-20',100),[80,99]);
  for(const value of ['bytes=-0','bytes=100-','bytes=20-10','bytes=0-1,4-5','bytes=-','bytes=999999999999999999-']) assert.equal(byteRange(value,100),null);
});
test('private media server enforces session path; delivers full ranges and HEAD without reading data',async t=>{
  const bytes=Buffer.alloc(2*1024*1024+17,7);let calls=0;
  const media=await startMediaServer({stream:async()=>({total:bytes.length,chunk:async(a,b)=>{calls++;return bytes.subarray(a,b+1);}})});t.after(()=>media.close());
  const url=media.url('456',720);
  const head=await fetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(calls,0);
  const response=await fetch(url,{headers:{Range:'bytes=11-'}});assert.equal(response.status,206);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(11));assert.equal(calls,3);
  const suffix=await fetch(url,{headers:{Range:'bytes=-20'}});assert.equal((await suffix.arrayBuffer()).byteLength,20);
  assert.equal((await fetch(url.replace(/\/[a-f0-9]{48}\//,'/wrong/'))).status,404);
  assert.equal((await fetch(url,{headers:{Range:'bytes=999999999-'}})).status,416);
});
test('media failures remain failures without exposing upstream secrets or leaking slots',async t=>{
  const media=await startMediaServer({stream:async()=>{throw new Error('https://signed.example/?secret=key');}});t.after(()=>media.close());
  for(let n=0;n<6;n++){const response=await fetch(media.url('456',720));assert.equal(response.status,502);assert.ok(!(await response.text()).includes('secret'));}
});
test('comic deferred data parser accepts mergeLoaderData and does not execute website scripts',()=>{
  const payload={isSuccess:true,rankList:[{seriesId:'123',title:'漫剧',cover:'https://example.org/1.jpg',episodeCount:3,rank:1,heatText:'10 万',tags:['漫剧']}],pagination:{pageNum:1,totalPages:3}};
  const args=['rank_hot-comic-drama/page',[{key:'content',routerDataFnName:'p',routerDataFnArgs:[payload]}]];
  const encoded=JSON.stringify(args).replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  const result=parseComicRanking(`<script>throw new Error('never execute')</script><script data-fn-name="mergeLoaderData" data-fn-args="${encoded}"></script>`,1);
  assert.equal(result.items[0].title,'漫剧');assert.equal(result.items[0].rank,1);assert.equal(result.totalPages,3);assert.equal(result.hasMore,true);
  assert.throws(()=>parseComicRanking(`<script data-fn-name="mergeLoaderData" data-fn-args="${encoded}"></script>`,2),/分页/);
});
test('rendered comic ranking fallback reads real title, position and page',()=>{
  const html=`<script>_ROUTER_DATA={"loaderData":{"rank_hot-comic-drama/page":{"rankKey":"comic","pageNum":1}}}</script><article aria-labelledby="rank-title-123"><h2 id="rank-title-123">漫画故事</h2><span class="badge-number-a">2</span><p class="metrics-a">全 20 集</p><p class="description-a">简介</p><img src="https://example.org/cover.jpg"></article><nav aria-label="榜单分页"><span aria-current="page">1</span><a href="?page=2">2</a></nav>`;
  const result=parseComicRanking(html,1);assert.equal(result.items[0].rank,2);assert.equal(result.items[0].title,'漫画故事');assert.equal(result.hasMore,true);
});
test('encrypted AVC sample entry is restored as AVC rather than mislabelled HEVC',()=>{
  const raw=Buffer.alloc(50);raw.writeUInt32BE(50,0);raw.write('encv',4);raw.writeUInt32BE(12,30);raw.write('frma',34);raw.write('avc1',38);
  const header=Buffer.from(raw);header.write('hvc1',4);repairVideoEntries(raw,header);assert.equal(header.toString('ascii',4,8),'avc1');
});
test('Android JSON backup keeps millisecond progress and sanitizes image URLs',()=>{
  const backup={...defaults(),favorites:[{...series,cover:'https://localhost/secret'}],history:[progress()]};
  const result=validateBackup(JSON.stringify(backup));assert.equal(result.history[0].position,12000);assert.equal(result.favorites[0].cover,'');
  assert.throws(()=>validateBackup(JSON.stringify({...backup,version:2})),/格式/);
  assert.throws(()=>validateBackup(JSON.stringify({...backup,history:[{...progress(),position:-1}]})),/数值/);
  assert.throws(()=>validateBackup(JSON.stringify({...backup,favorites:[series,series]})),/重复/);
});
test('backup merge uses newer progress and preserves local preference unless selected',()=>{
  const local={...defaults(),favorites:[series],history:[progress(2000,20000)]};
  const incoming={...defaults(),favorites:[{...series,title:'传入标题'}],history:[progress(1000,10000)],settings:{...defaults().settings,speed:2}};
  const result=mergeBackup(local,incoming);assert.equal(result.favorites.length,1);assert.equal(result.favorites[0].title,series.title);assert.equal(result.history[0].position,20000);assert.equal(result.settings.speed,1);
  incoming.history=[progress(3000,30000)];assert.equal(mergeBackup(local,incoming,true).history[0].position,30000);assert.equal(mergeBackup(local,incoming,true).settings.speed,2);
});
test('library survives restart with exact episode identity and saved preferences',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hongguotv-test-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const library=new Library(directory);library.toggle('favorites',series);library.progress(progress());library.settings({speed:1.5});
  const restored=new Library(directory);assert.equal(restored.value.favorites[0].id,'123');assert.equal(restored.value.history[0].episodeId,'456');assert.equal(restored.value.settings.speed,1.5);
  restored.toggle('favorites',series);assert.equal(restored.value.favorites.length,0);assert.equal(restored.value.history.length,1);
});
