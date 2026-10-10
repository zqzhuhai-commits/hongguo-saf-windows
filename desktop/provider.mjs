// SPDX-License-Identifier: GPL-3.0-only
// Desktop adapter: original protocol source remains unchanged in vendor/.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import axios from 'axios';
import smCrypto from 'sm-crypto';
import {load} from 'cheerio';

export function compatibleCrypto(native = crypto) {
  return {...native, createHash(algorithm, ...args) {
    // Electron uses BoringSSL, which does not consistently expose SM3.
    if (algorithm.toLowerCase() !== 'sm3') return native.createHash(algorithm, ...args);
    const pieces = [];
    return {update(value, encoding) {pieces.push(Buffer.from(value, encoding)); return this;},
      digest(encoding) {const out = Buffer.from(smCrypto.sm3(Array.from(Buffer.concat(pieces))), 'hex'); return encoding ? out.toString(encoding) : out;}};
  }};
}

const source = fs.readFileSync(new URL('./vendor/hongguo.cjs', import.meta.url), 'utf8');
const context = vm.createContext({
  require(name) {if (name === 'node:crypto') return compatibleCrypto(); throw new Error('Unsupported module');},
  Buffer, URL, URLSearchParams,
  axios: axios.create({maxContentLength:16*1024*1024, maxBodyLength:1024*1024})
});
vm.runInContext(source + '\nthis.api = {categoryPage, itemToCard, routerData, getText, extractAssignedJson, appSearchPage, appSearchParams, signedAppGet, appSearchCells, appSearchVod, fetchVideoInfo, qualityNumber, qualityLabel, decryptSpadeUrl, deriveContentKey, remoteRange, prepareCencHeader, decryptPartial, streamCache, videoInfoCache, pageCache, appSearchCache};', context, {timeout:5000});
const api = context.api;
const SITE = 'https://hongguoduanju.com';
const validId = id => typeof id === 'string' && /^\d{1,30}$/.test(id);
const card = row => ({id:String(row.url),title:String(row.title || ''),cover:String(row.img || ''),description:String(row.content || ''),badge:String(row.desc || ''),tags:String(row.tname || '')});
const cards = rows => [...new Map(Array.from(rows, card).filter(row => validId(row.id) && row.title).map(row => [row.id,row])).values()];

export function parseComicRanking(html, page) {
  const $ = load(html);
  let route = {};
  try {route = api.extractAssignedJson(html)?.loaderData?.['rank_hot-comic-drama/page'] || {};} catch {}
  for (const node of $('script[data-fn-name][data-fn-args]').toArray()) {
    const name = $(node).attr('data-fn-name');
    if (!['r','mergeLoaderData'].includes(name)) continue;
    let args;
    try {args = JSON.parse($(node).attr('data-fn-args'));} catch {continue;}
    if (args?.[0] !== 'rank_hot-comic-drama/page') continue;
    let payload = name === 'r' && args[1] === 'content' ? args[2] : name === 'mergeLoaderData' ? args[1]?.find(row => row.key === 'content' && row.routerDataFnName === 'p')?.routerDataFnArgs?.[0] : null;
    if (typeof payload === 'string') payload = JSON.parse(payload);
    if (!payload) continue;
    if (!payload.isSuccess || !Array.isArray(payload.rankList)) throw new Error('漫剧榜单暂不可用');
    const totalPages = Math.min(100, Number(payload.pagination?.totalPages));
    if (!Number.isInteger(totalPages) || totalPages < 1 || Number(payload.pagination?.pageNum || page) !== page) throw new Error('漫剧分页信息异常');
    const items = payload.rankList.map(row => ({id:String(row.seriesId || row.id || ''),title:String(row.title || ''),cover:String(row.cover || ''),description:String(row.description || ''),badge:row.episodeCount ? `全 ${row.episodeCount} 集` : String(row.heatText || ''),tags:(row.tags || []).slice(0,5).join(' · '),rank:Number(row.rank)||null,heat:String(row.heatText || '')})).filter(row => validId(row.id) && row.title);
    return {items:[...new Map(items.map(row => [row.id,row])).values()],page,totalPages,hasMore:items.length > 0 && page < totalPages,updatedText:String(route.updatedText || '')};
  }
  if (route.rankKey !== 'comic' || Number(route.pageNum) !== page) throw new Error('页面没有漫剧榜单数据');
  const items = $('article[aria-labelledby^="rank-title-"]').toArray().map(node => {
    const el = $(node), heading = el.attr('aria-labelledby'), id = heading.replace('rank-title-','');
    return {id,title:el.find(`[id="${heading}"]`).text().trim(),cover:el.find('img[src]').first().attr('src') || '',description:el.find('p[class*="description-"]').text().trim(),badge:el.find('p[class*="metrics-"]').text().trim(),tags:el.find('p[class*="categories-"] > span').toArray().slice(0,5).map(n => $(n).text()).join(' · '),rank:Number(el.find('[class*="badge-number-"]').text())||null,heat:el.find('p[class*="metrics-"]').text().trim()};
  }).filter(row => validId(row.id) && row.title);
  const paging = $('nav[aria-label="榜单分页"]');
  if (!items.length || Number(paging.find('[aria-current="page"]').text()) !== page) throw new Error('漫剧榜单格式已变化');
  const totalPages = Math.min(100, Math.max(page,...paging.find('a[href]').toArray().map(n => Number(new URL($(n).attr('href'),SITE).searchParams.get('page')) || 1)));
  return {items:[...new Map(items.map(row => [row.id,row])).values()],page,totalPages,hasMore:page<totalPages,updatedText:String(route.updatedText || '')};
}

// Preserve the actual video sample entry; the legacy bridge assumed HEVC.
export function repairVideoEntries(raw, header) {
  let pos = 0;
  while ((pos = raw.indexOf(Buffer.from('encv'), pos)) >= 0) {
    if (pos >= 4) {
      const end = pos - 4 + raw.readUInt32BE(pos - 4);
      if (end > pos + 8 && end <= raw.length) {
        const frma = raw.indexOf(Buffer.from('frma'),pos + 4);
        const declared = frma >= 0 && frma + 8 <= end ? raw.toString('ascii',frma+4,frma+8) : '';
        const avc = raw.indexOf(Buffer.from('avcC'),pos+4);
        const format = ['avc1','avc3','hvc1','hev1'].includes(declared) ? declared : avc >= 0 && avc < end ? 'avc1' : 'hvc1';
        header.write(format,pos,'ascii');
      }
    }
    pos += 4;
  }
  return header;
}

async function prepare(stream) {
  if (stream.prepared) return stream.prepared;
  if (!stream.preparePromise) stream.preparePromise = (async () => {
    const first = await api.remoteRange(stream,0,256*1024-1);
    let head = Buffer.from(first.data); const total = first.total;
    if (!Number.isSafeInteger(total) || total < head.length || head.length < 16 || head.toString('ascii',4,8) !== 'ftyp') throw new Error('视频头格式异常');
    const ftypSize = head.readUInt32BE(0);
    if (ftypSize < 8 || ftypSize + 8 > head.length || head.toString('ascii',ftypSize+4,ftypSize+8) !== 'moov') throw new Error('视频索引格式异常');
    const moovSize = head.readUInt32BE(ftypSize), end = ftypSize + moovSize;
    if (moovSize < 8 || end > total || end > 8*1024*1024) throw new Error('视频索引超出限制');
    if (end > head.length) head = Buffer.concat([head,Buffer.from((await api.remoteRange(stream,head.length,end-1)).data)]);
    head = head.subarray(0,end);
    const p = stream.key ? api.prepareCencHeader(head,stream.key) : {header:head,samples:[]};
    if (p.samples.length > 300000) throw new Error('视频索引过大');
    repairVideoEntries(head,p.header);
    return stream.prepared = {total,header:p.header,samples:p.samples};
  })();
  try {return await stream.preparePromise;} finally {delete stream.preparePromise;}
}

export const provider = {
  async home(page = 1, type = 'comic') {
    if (type === 'comic') return parseComicRanking(await api.getText(`${SITE}/rank/hot-comic-drama?page=${page}`),page);
    const data = await api.categoryPage('tab=1&sort_type=1',page);
    const section = data?.loaderData?.category_page || data?.loaderData?.['category_$'];
    const rows = section?.recommendList || section?.categoryData?.recommendList;
    if (!Array.isArray(rows)) throw new Error('首页数据结构已变化');
    const items = cards(rows.map(api.itemToCard));
    const totalPages = Math.min(Number(section.pagination?.totalPages || 100),100);
    return {items,page,totalPages,hasMore:items.length>0 && page<totalPages};
  },
  async search(keyword, page = 1, type = 'comic') {
    const tabType = type === 'comic' ? 19 : 11;
    // Inspect the response rather than treating a missing search tab as an empty success.
    let cursor = {};
    const key = `${tabType}|${keyword}|${page}`;
    if (page === 1) for (const k of api.appSearchCache.keys()) if (k.startsWith(`${tabType}|${keyword}|`)) api.appSearchCache.delete(k);
    const cached = api.appSearchCache.get(key);
    if (cached && Date.now()-cached.time<300000) return {items:cards(cached.value.list),page,hasMore:cached.value.hasMore};
    if (page > 1) {
      const previous = api.appSearchCache.get(`${tabType}|${keyword}|${page-1}`);
      if (!previous || Date.now()-previous.time>=300000) throw new Error('搜索结果已过期，请从第 1 页重新搜索');
      cursor = previous.value.cursor;
    }
    try {
      const data = await api.signedAppGet(api.appSearchParams(keyword,tabType,20,cursor,page));
      const tab = (data.search_tabs || data.data?.search_tabs || []).find(row => Number(row.tab_type) === tabType);
      if (!tab || !Array.isArray(tab.data)) throw new Error('搜索接口暂不可用');
      const list = Array.from(tab.data).flatMap(cell => Array.from(api.appSearchCells(cell))).map(api.appSearchVod).filter(Boolean);
      const value = {list,hasMore:!!tab.has_more,cursor:{search_id:String(tab.search_id || ''),passback:String(tab.passback || ''),next_offset:String(tab.next_offset || '')}};
      api.appSearchCache.set(key,{time:Date.now(),value});
      return {items:cards(list),page,hasMore:value.hasMore && page<100};
    } catch (error) {
      if (type === 'comic') throw error;
      const data = await api.routerData(`${SITE}/search/${encodeURIComponent(keyword)}?page=${page}`);
      const section = data?.loaderData?.['search_(keyword)/page'] || data?.loaderData?.search_page;
      if (!Array.isArray(section?.searchList)) throw new Error('搜索数据不可用');
      const items = cards(section.searchList.map(api.itemToCard));
      return {items,page,hasMore:items.length>0 && page<100};
    }
  },
  async detail(id) {
    if (!validId(id)) throw new Error('剧集 ID 无效');
    const data = await api.routerData(`${SITE}/detail?series_id=${id}`);
    const series = data?.loaderData?.detail_page?.seriesDetail;
    if (!series || !Array.isArray(series.vid_list) || !series.vid_list.length || series.vid_list.length>2000) throw new Error('分集暂不可用');
    const episodes = Array.from(series.vid_list,(vid,index) => ({id:String(vid),number:index+1,title:`第 ${index+1} 集`}));
    if (episodes.some(e => !validId(e.id)) || new Set(episodes.map(e => e.id)).size !== episodes.length) throw new Error('分集数据异常');
    return {...card(api.itemToCard(series)),id,episodes};
  },
  async stream(id, quality = 720, fresh = false) {
    if (!validId(id)) throw new Error('分集 ID 无效');
    const key = `${id}|desktop-${quality}`;
    if (fresh) {api.streamCache.delete(key); api.videoInfoCache.delete(id);}
    let stream = api.streamCache.get(key);
    if (!stream || Date.now()-stream.time>=240000) {
      const {info,rows} = await api.fetchVideoInfo(id);
      const compatible = Array.from(rows).filter(row => !['bytevc2','bvc2'].includes(String(row.item.codec_type || '').toLowerCase()));
      const avc = compatible.filter(row => /^(avc|h264|h\.264|avc1)$/i.test(String(row.item.codec_type || '')));
      const pool = avc.length ? avc : compatible;
      const selected = pool.find(row => api.qualityNumber(row.quality)<=quality) || pool.at(-1);
      if (!selected) throw new Error('没有兼容的播放资源');
      let url = String(selected.item.main_url);
      const seed = Buffer.from(String(info.key_seed || ''),'base64');
      if (seed.length) url = api.decryptSpadeUrl(url,seed);
      if (!/^https?:\/\//.test(url)) throw new Error('播放地址无效');
      stream = {time:Date.now(),value:{url,key:selected.item.spade_a ? api.deriveContentKey(selected.item.spade_a) : null,quality:api.qualityLabel(selected.quality),codec:String(selected.item.codec_type || '')}};
      api.streamCache.set(key,stream);
    }
    const value = stream.value, prepared = await prepare(value);
    return {total:prepared.total,quality:value.quality,codec:value.codec,
      chunk:async (start,end) => api.decryptPartial((await api.remoteRange(value,start,end)).data,start,value.key,prepared)};
  }
};

const cleanup = setInterval(() => {
  for (const cache of [api.streamCache,api.videoInfoCache,api.pageCache,api.appSearchCache]) {
    for (const [key,value] of cache) if (Date.now()-value.time>300000) cache.delete(key);
    while (cache.size>100) cache.delete(cache.keys().next().value);
  }
},60000);
cleanup.unref();
