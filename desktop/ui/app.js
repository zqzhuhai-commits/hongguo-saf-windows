/* SPDX-License-Identifier: GPL-3.0-only */
'use strict';
const $=selector=>document.querySelector(selector);
const api=window.desktop;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cover=value=>/^https:\/\//i.test(String(value||''))?esc(value):'';
let library,mode='home',page=1,query='',items=[],request=0,detailRequest=0,detail=null,toastTimer;
let playerDetail=null,episodeIndex=0,playing=false,playRequest=0,resume=0,reopenDetail=false,lastSave=0,retries=0,loadPaused=false;
let timerDeadline=0,timerEpisodes=0,autoStopped=false,transitioning=false;
const video=$('#video');
const run=fn=>Promise.resolve().then(fn).catch(error=>toast(error.message));
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
const isFavorite=id=>library.favorites.some(row=>row.id===id);
const isLater=id=>library.later.some(row=>row.id===id);
const record=id=>library.history.find(row=>row.series.id===id);
const time=ms=>{const sec=Math.floor(Math.max(0,ms)/1000);return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;};
const progressPercent=row=>row?.duration?Math.min(100,Math.round(row.position/row.duration*100)):0;
function applyLibrary(value){library=value;$('#favorite-count').textContent=library.favorites.length;document.querySelectorAll('[data-type]').forEach(b=>b.classList.toggle('active',b.dataset.type===library.settings.type));updateSavedButtons();}
function updateSavedButtons(){document.querySelectorAll('[data-action="favorite"],[data-action="later"]').forEach(button=>{const favorite=button.dataset.action==='favorite',saved=favorite?isFavorite(button.dataset.id):isLater(button.dataset.id);button.classList.toggle('saved',saved);button.textContent=favorite?(saved?'♥ 已收藏':'♡ 收藏'):(saved?'✓ 稍后看':'＋ 稍后看');});}
function titleData(){const type=library.settings.type==='comic'?'漫剧':'短剧';return {
  home:['DISCOVER YOUR NEXT STORY',`${type}，随时开看`,library.settings.type==='comic'?'从漫剧热播榜发现新故事。':'浏览热门短剧，找到你想看的故事。'],
  ranking:['TRENDING NOW','漫剧排行榜','榜单来自内容网站，按来源名次展示。'],
  search:['FIND A STORY',`“${query}”的搜索结果`,`${type} · 搜索结果按内容源顺序展示`],
  favorites:['YOUR COLLECTION','我的收藏',`${library.favorites.length} 部故事，留给下一次相遇。`],
  later:['WATCH LATER','稍后看',`${library.later.length} 部故事，慢慢挑，随时看。`],
  history:['CONTINUE WATCHING','最近观看','保存集数与播放位置，下次接着看。'],
  settings:['MAKE IT YOURS','设置','播放偏好和片单管理。']
}[mode];}
function heading(){const [eyebrow,title,subtitle]=titleData();return `<div class="page-heading"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1><p class="subtitle">${esc(subtitle)}</p></div>${['home','ranking','search'].includes(mode)?'<button class="button ghost" data-action="refresh">↻ 刷新</button>':''}</div>`;}
function renderCards(rows){return `<div class="catalog-grid">${rows.map(row=>{const history=record(row.id);return `<article class="card" data-series="${esc(row.id)}"><button class="poster-button" data-action="detail" data-id="${esc(row.id)}" aria-label="${esc(row.title)} 详情"><div class="poster"><span>果</span>${cover(row.cover)?`<img src="${cover(row.cover)}" alt="${esc(row.title)}" loading="lazy" referrerpolicy="no-referrer">`:''}<div class="play-hover"><b>▶</b></div>${row.rank?`<strong class="rank-badge">${esc(row.rank)}</strong>`:''}<div class="badge">${esc(row.badge)}</div></div><h3>${esc(row.title)}</h3></button><p class="card-meta">${esc(mode==='history'&&history?`第 ${history.episodeIndex+1} 集 · ${time(history.position)}${history.completed?' · 本集已看完':''}`:row.heat||row.tags||'打开详情查看选集')}</p>${mode==='history'&&history?`<progress max="100" value="${progressPercent(history)}"></progress>`:''}<div class="card-actions"><button data-action="favorite" data-id="${esc(row.id)}" class="${isFavorite(row.id)?'saved':''}">${isFavorite(row.id)?'♥ 已收藏':'♡ 收藏'}</button><button data-action="${mode==='history'?'remove-history':'later'}" data-id="${esc(row.id)}">${mode==='history'?'移除':isLater(row.id)?'✓ 稍后看':'＋ 稍后看'}</button></div></article>`;}).join('')}</div>`;}
function continueRow(){const rows=library.history.filter(row=>!library.watched.includes(row.series.id)).slice(0,3);if(!rows.length)return '';return `<div class="section-heading"><h2>接着看</h2><small>从上次停下的地方继续</small></div><div class="continue-row">${rows.map(row=>`<article class="continue-card">${cover(row.series.cover)?`<img src="${cover(row.series.cover)}" alt="" referrerpolicy="no-referrer">`:''}<div><h3>${esc(row.series.title)}</h3><p>第 ${row.episodeIndex+1} 集 · ${row.completed?'本集已看完':time(row.position)}</p><button data-action="resume" data-id="${esc(row.series.id)}">▶ 继续观看</button></div></article>`).join('')}</div><div class="section-heading"><h2>${library.settings.type==='comic'?'热播漫剧':'热门发现'}</h2><small>浏览更多新故事</small></div>`;}
function empty(title,description,retry=false){return `<div class="empty-state"><h2>${esc(title)}</h2><p>${esc(description)}</p>${retry?'<button class="button primary" data-action="refresh">重试</button>':''}</div>`;}
function pagination(hasMore,totalPages){return `<div class="pagination"><button class="button" data-action="previous" ${page<=1?'disabled':''}>← 上一页</button><span>第 ${page}${totalPages?` / ${totalPages}`:''} 页</span><button class="button" data-action="next" ${!hasMore?'disabled':''}>下一页 →</button></div>`;}
function localRows(){return mode==='favorites'?library.favorites:mode==='later'?library.later:library.history.map(row=>row.series);}
async function showPage(reset=true){
  if(reset){page=1;window.scrollTo(0,0);}const token=++request;
  document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===mode));
  if(mode==='settings'){renderSettings();return;}
  if(['favorites','later','history'].includes(mode)){
    const rows=localRows(),total=Math.max(1,Math.ceil(rows.length/24));page=Math.min(page,total);items=rows.slice((page-1)*24,page*24);
    $('#content').innerHTML=heading()+(items.length?renderCards(items)+pagination(page<total,total):empty('片单还是空的',mode==='history'?'开始播放后，观看记录会自动保存在这里。':'打开剧集详情，加入片单后就能在这里找到。'));return;
  }
  const recent=mode==='search'&&library.searches.length?`<div class="recent-searches">${library.searches.map(row=>`<button data-action="recent-search" data-query="${esc(row.query)}" data-type="${esc(row.type)}">${esc(row.query)} · ${row.type==='comic'?'漫剧':'短剧'}</button>`).join('')}</div>`:'';
  $('#content').innerHTML=heading()+recent+(mode==='home'&&page===1?continueRow():'')+`<div class="catalog-grid skeleton">${Array.from({length:12},()=>'<div><div class="poster"></div><h3></h3><p></p></div>').join('')}</div>`;
  try{
    const data=await api.catalog({mode,page,query,type:library.settings.type});if(token!==request)return;
    applyLibrary(data.library);items=data.result.items;
    $('#content').innerHTML=heading()+recent+(mode==='home'&&page===1?continueRow():'')+(items.length?renderCards(items)+pagination(data.result.hasMore,data.result.totalPages):empty('没有找到相关剧集','试试其他关键词，或切换漫剧 / 短剧。'));
  }catch(error){if(token!==request)return;items=[];$('#content').innerHTML=heading()+(mode==='home'&&page===1?continueRow():'')+empty('内容暂时无法加载',error.message+'。请确认电脑联网；接口或地区网络变化也可能影响内容。',true);}
}
function findSeries(id){return items.find(row=>row.id===id)||library.favorites.find(row=>row.id===id)||library.later.find(row=>row.id===id)||record(id)?.series||(detail?.id===id?detail:null);}
async function showDetail(id){
  const token=++detailRequest;$('#detail-content').innerHTML=`<div class="detail-head">剧集详情<button class="button ghost" data-action="close-detail">关闭 ×</button></div><div class="empty-state"><div class="spinner"></div><p>正在读取剧集详情…</p></div>`;
  if(!$('#detail-dialog').open)$('#detail-dialog').showModal();
  try{const result=await api.detail(id);if(token!==detailRequest||!$('#detail-dialog').open)return;detail=result;renderDetail();}
  catch(error){if(token!==detailRequest||!$('#detail-dialog').open)return;$('#detail-content').innerHTML=`<div class="detail-head">剧集详情<button class="button ghost" data-action="close-detail">关闭 ×</button></div>${empty('详情暂不可用',error.message)}<div class="detail-actions episodes"><button class="button primary" data-action="detail" data-id="${esc(id)}">重试</button></div>`;}
}
function episodeButtons(data,current){return data.episodes.map((episode,index)=>`<button data-action="episode" data-index="${index}" class="${index===current?'current':''}" title="${esc(episode.title)}">${index+1}</button>`).join('');}
function renderDetail(){const history=record(detail.id);let index=history?detail.episodes.findIndex(e=>e.id===history.episodeId):-1;if(index<0)index=0;const tags=detail.tags.split(/[\/·]/).filter(Boolean).slice(0,5);$('#detail-content').innerHTML=`<div class="detail-head">剧集详情 · ${detail.episodes.length} 集<button class="button ghost" data-action="close-detail">关闭 ×</button></div><div class="detail-body">${cover(detail.cover)?`<img class="detail-cover" src="${cover(detail.cover)}" alt="${esc(detail.title)}" referrerpolicy="no-referrer">`:''}<div class="detail-info"><h2>${esc(detail.title)}</h2><span class="tag">${detail.episodes.length} 集</span>${tags.map(tag=>`<span class="tag">${esc(tag)}</span>`).join('')}<p class="description">${esc(detail.description||'内容源暂未提供简介。')}</p><div class="detail-actions"><button class="button primary" data-action="detail-play">▶ ${history?'继续观看':'开始观看'}</button><button class="button" data-action="favorite" data-id="${esc(detail.id)}">${isFavorite(detail.id)?'♥ 已收藏':'♡ 收藏'}</button><button class="button" data-action="later" data-id="${esc(detail.id)}">${isLater(detail.id)?'✓ 稍后看':'＋ 稍后看'}</button></div>${history?`<p class="subtitle">上次看到第 ${history.episodeIndex+1} 集 · ${time(history.position)}</p>`:''}</div></div><div class="episodes"><div class="section-heading"><h3>选集</h3><form id="jump-form" class="jump"><label for="jump-number">跳转</label><input id="jump-number" type="number" min="1" max="${detail.episodes.length}" value="${index+1}"><button class="button" type="submit">播放</button></form></div><div class="episode-grid">${episodeButtons(detail,index)}</div></div>`;updateSavedButtons();}
function renderSettings(){const settings=library.settings;const option=(value,label,current)=>`<option value="${value}" ${value===current?'selected':''}>${label}</option>`;$('#content').innerHTML=heading()+`<div class="settings-layout"><section class="settings-panel"><h2>播放偏好</h2><label class="setting-row"><span>默认清晰度<small>优先选择兼容的 AVC / H.264 资源。</small></span><select data-setting="quality">${[480,720,1080].map(n=>option(n,n+'P',settings.quality)).join('')}</select></label><label class="setting-row"><span>默认倍速</span><select data-setting="speed">${[0.75,1,1.25,1.5,1.75,2].map(n=>option(n,n+'×',settings.speed)).join('')}</select></label><label class="setting-row"><span>自动连播<small>本集播放结束后，自动进入下一集。</small></span><input type="checkbox" data-setting="autoNext" ${settings.autoNext?'checked':''}></label><label class="setting-row"><span>画面模式<small>完整画面保留原始比例；铺满可能裁切字幕。</small></span><select data-setting="frame">${[['FIT','完整画面'],['FILL','等比铺满'],['STRETCH','拉伸铺满']].map(([value,label])=>option(value,label,settings.frame)).join('')}</select></label></section><section class="settings-panel"><h2>片单与设备</h2><p>收藏、稍后看、搜索历史和播放位置保存在这台电脑上。支持导入原 Kotlin 安卓版导出的 JSON 备份。</p><div class="backup-actions"><button class="button" data-action="export">导出备份</button><button class="button" data-action="import">导入备份</button></div><div class="notice-box">红果短剧SAF版 0.8.0<br>基于 N3urda/hongguoTV，按 GPL-3.0 发布。<br>内容与接口来自第三方。没有实现红果账号登录或同步；内容接口失效时会明确显示错误。</div><p>键盘：空格播放 / 暂停，← / → 跳转 10 秒，Esc 返回，F11 全屏。文件包中附带许可证与源码说明。</p></section></div>`;}
async function openPlayer(data,index=0,position=0){
  playerDetail=data;episodeIndex=index;resume=position;playing=true;autoStopped=false;timerDeadline=0;timerEpisodes=0;$('#sleep-timer').value='0';
  reopenDetail=$('#detail-dialog').open;if(reopenDetail)$('#detail-dialog').close();
  $('#player').hidden=false;$('#player-episodes').hidden=true;document.body.classList.add('playing');retries=0;await loadEpisode(false,position,false);
}
function applyVideoSettings(){video.playbackRate=library.settings.speed;video.style.objectFit={FIT:'contain',FILL:'cover',STRETCH:'fill'}[library.settings.frame];$('#player-quality').value=String(library.settings.quality);$('#player-speed').value=String(library.settings.speed);}
async function loadEpisode(fresh=false,position=0,paused=false){
  if(!playing||!playerDetail?.episodes[episodeIndex])return;const token=++playRequest,episode=playerDetail.episodes[episodeIndex];
  transitioning=true;video.pause();video.removeAttribute('src');video.load();resume=position;loadPaused=paused;lastSave=0;
  $('#player-loading').hidden=false;$('#player-error').hidden=true;$('#playing-title').textContent=playerDetail.title;$('#playing-info').textContent=`第 ${episodeIndex+1} / ${playerDetail.episodes.length} 集 · 正在准备`;
  $('#previous-episode').disabled=episodeIndex===0;$('#next-episode').disabled=episodeIndex>=playerDetail.episodes.length-1;$('#player-episode-grid').innerHTML=episodeButtons(playerDetail,episodeIndex);applyVideoSettings();
  try{
    const result=await api.play({id:episode.id,quality:library.settings.quality,fresh});if(token!==playRequest||!playing)return;
    $('#playing-info').textContent=`第 ${episodeIndex+1} / ${playerDetail.episodes.length} 集 · ${result.quality}${result.codec?' · '+result.codec.toUpperCase():''}`;
    video.src=result.url;video.load();
  }catch(error){if(token!==playRequest||!playing)return;showPlayerError(error.message);}
}
function showPlayerError(text){transitioning=false;$('#player-loading').hidden=true;$('#player-error').hidden=false;$('#player-error-text').textContent=text;}
async function saveProgress(completed=false){if(transitioning||!playing||!playerDetail||!video.src||!Number.isFinite(video.currentTime)||video.readyState<1)return;const row={series:playerDetail,episodeId:playerDetail.episodes[episodeIndex].id,episodeIndex,position:Math.max(0,Math.round(video.currentTime*1000)),duration:Number.isFinite(video.duration)?Math.max(0,Math.round(video.duration*1000)):0,completed,updatedAt:Date.now()};applyLibrary(await api.progress(row));}
async function changeEpisode(index){if(index<0||index>=playerDetail.episodes.length)return;await saveProgress();episodeIndex=index;retries=0;$('#player-episodes').hidden=true;await loadEpisode(false,0,false);}
async function closePlayer(){if(!playing)return;await saveProgress(video.ended);playing=false;playRequest++;video.pause();video.removeAttribute('src');video.load();$('#player').hidden=true;timerDeadline=0;timerEpisodes=0;document.body.classList.remove('playing');if(reopenDetail&&detail){renderDetail();$('#detail-dialog').showModal();}else await showPage(false);}
async function resumeSeries(id){const data=await api.detail(id),history=record(id);let index=history?data.episodes.findIndex(e=>e.id===history.episodeId):0;if(index<0)index=0;let position=history?.position/1000||0;if(history?.completed&&index<data.episodes.length-1){index++;position=0;}await openPlayer(data,index,position);}

document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||button.disabled)return;run(async()=>{
  if(button.dataset.nav){mode=button.dataset.nav;await showPage();return;}
  if(button.dataset.type){applyLibrary(await api.settings({type:button.dataset.type}));mode='home';await showPage();return;}
  const action=button.dataset.action,id=button.dataset.id;
  if(action==='detail'){await showDetail(id);return;}
  if(action==='close-detail'){detailRequest++;$('#detail-dialog').close();return;}
  if(action==='refresh'){await showPage(false);return;}
  if(action==='previous'||action==='next'){page+=action==='next'?1:-1;window.scrollTo(0,0);await showPage(false);return;}
  if(action==='favorite'||action==='later'){
    const series=findSeries(id);if(!series)throw new Error('剧集记录不可用');applyLibrary(await api.toggle({kind:action==='favorite'?'favorites':'later',series}));
    if(mode===action+'s'||mode===action)await showPage(false);return;
  }
  if(action==='remove-history'){applyLibrary(await api.removeHistory(id));await showPage(false);return;}
  if(action==='resume'){await resumeSeries(id);return;}
  if(action==='detail-play'){const history=record(detail.id);let index=history?detail.episodes.findIndex(e=>e.id===history.episodeId):0;if(index<0)index=0;let position=history?.position/1000||0;if(history?.completed&&index<detail.episodes.length-1){index++;position=0;}await openPlayer(detail,index,position);return;}
  if(action==='episode'){const index=Number(button.dataset.index);if(playing)await changeEpisode(index);else await openPlayer(detail,index);return;}
  if(action==='recent-search'){query=button.dataset.query;$('#query').value=query;applyLibrary(await api.settings({type:button.dataset.type}));mode='search';await showPage();return;}
  if(action==='export'){if(await api.exportBackup())toast('片单与观看记录已导出');return;}
  if(action==='import'){const value=await api.importBackup();if(value){applyLibrary(value);renderSettings();toast('备份已合并到本机记录');}return;}
});});
$('#search-form').addEventListener('submit',event=>{event.preventDefault();query=$('#query').value.trim();if(!query){toast('请输入剧名或关键词');return;}mode='search';run(()=>showPage());});
$('#detail-dialog').addEventListener('cancel',()=>detailRequest++);
$('#detail-dialog').addEventListener('submit',event=>{if(event.target.id!=='jump-form')return;event.preventDefault();const index=Number($('#jump-number').value)-1;if(!Number.isInteger(index)||index<0||index>=detail.episodes.length){toast('请输入有效集数');return;}run(()=>openPlayer(detail,index));});
document.addEventListener('change',event=>{const key=event.target.dataset.setting;if(!key)return;const value=key==='autoNext'?event.target.checked:['quality','speed'].includes(key)?Number(event.target.value):event.target.value;run(async()=>applyLibrary(await api.settings({[key]:value})));});
$('#fullscreen').addEventListener('click',()=>run(()=>api.fullscreen()));$('#player-fullscreen').addEventListener('click',()=>run(()=>api.fullscreen()));
$('#close-player').addEventListener('click',()=>run(closePlayer));
$('#previous-episode').addEventListener('click',()=>run(()=>changeEpisode(episodeIndex-1)));$('#next-episode').addEventListener('click',()=>run(()=>changeEpisode(episodeIndex+1)));
$('#show-episodes').addEventListener('click',()=>{$('#player-episodes').hidden=!$('#player-episodes').hidden;if(!$('#player-episodes').hidden)$('#player-episode-grid .current')?.scrollIntoView({block:'nearest'});});
$('#hide-episodes').addEventListener('click',()=>$('#player-episodes').hidden=true);
$('#seek-back').addEventListener('click',()=>video.currentTime=Math.max(0,video.currentTime-10));$('#seek-forward').addEventListener('click',()=>video.currentTime=Math.min(video.duration||0,video.currentTime+10));
$('#player-quality').addEventListener('change',()=>run(async()=>{const position=video.currentTime,paused=video.paused;await saveProgress();applyLibrary(await api.settings({quality:Number($('#player-quality').value)}));retries=0;await loadEpisode(true,position,paused);}));
$('#player-speed').addEventListener('change',()=>run(async()=>{applyLibrary(await api.settings({speed:Number($('#player-speed').value)}));applyVideoSettings();}));
$('#sleep-timer').addEventListener('change',()=>{const value=$('#sleep-timer').value;timerDeadline=/^\d+$/.test(value)&&Number(value)>0?Date.now()+Number(value)*60000:0;timerEpisodes=value==='end'?1:value==='3episodes'?3:value==='5episodes'?5:0;autoStopped=false;toast(value==='0'?'定时停止已取消':'定时停止已设置');});
$('#retry-player').addEventListener('click',()=>run(()=>loadEpisode(true,video.currentTime||resume,video.paused)));
video.addEventListener('loadedmetadata',()=>{if(!playing)return;transitioning=false;if(resume>0&&Number.isFinite(video.duration))video.currentTime=Math.min(resume,Math.max(0,video.duration-0.5));applyVideoSettings();if(!loadPaused)video.play().catch(()=>toast('视频已准备好，点击播放按钮开始观看'));});
video.addEventListener('loadeddata',()=>{if(playing)$('#player-loading').hidden=true;});
video.addEventListener('playing',()=>{$('#player-loading').hidden=true;$('#player-error').hidden=true;});
video.addEventListener('waiting',()=>{if(playing&&$('#player-error').hidden)$('#player-loading').hidden=false;});
video.addEventListener('timeupdate',()=>{if(playing&&Date.now()-lastSave>10000){lastSave=Date.now();run(()=>saveProgress());}});
video.addEventListener('play',()=>{if(playing&&!transitioning)loadPaused=false;});
video.addEventListener('pause',()=>{if(playing&&!transitioning&&video.readyState>0){loadPaused=true;run(()=>saveProgress(video.ended));}});
video.addEventListener('ended',()=>run(async()=>{if(!playing)return;await saveProgress(true);if(timerEpisodes>0&&--timerEpisodes===0){autoStopped=true;toast('已达到定时停止条件');return;}if(!autoStopped&&library.settings.autoNext&&episodeIndex<playerDetail.episodes.length-1){episodeIndex++;retries=0;await loadEpisode(false,0,false);}}));
video.addEventListener('error',()=>run(async()=>{if(!playing||!video.src)return;const code=video.error?.code;if(code===2&&retries<3){retries++;await loadEpisode(true,video.currentTime||resume,loadPaused);return;}showPlayerError(code===3||code===4?'视频编码不兼容或内容源不可用。请尝试 480P / 720P，或更换剧集。':'网络或视频源暂不可用，请检查连接后重试。');}));
document.addEventListener('keydown',event=>{
  if(event.key==='F11'){event.preventDefault();run(()=>api.fullscreen());return;}
  if(!playing||/INPUT|SELECT|TEXTAREA/.test(event.target.tagName))return;
  if(event.key==='Escape'){event.preventDefault();if(!$('#player-episodes').hidden)$('#player-episodes').hidden=true;else run(closePlayer);}
  if(event.code==='Space'){event.preventDefault();video.paused?video.play().catch(()=>toast('暂时无法播放')):video.pause();}
  if(event.key==='ArrowLeft'){event.preventDefault();video.currentTime=Math.max(0,video.currentTime-10);}
  if(event.key==='ArrowRight'){event.preventDefault();video.currentTime=Math.min(video.duration||0,video.currentTime+10);}
});
setInterval(()=>{if(playing&&timerDeadline&&Date.now()>=timerDeadline){timerDeadline=0;autoStopped=true;loadPaused=true;video.pause();toast('已到定时停止时间');run(()=>saveProgress());}},1000);
window.addEventListener('pagehide',()=>{if(playing)run(()=>saveProgress());});
run(async()=>{if(!api)throw new Error('请通过 红果短剧SAF版.exe 启动桌面版');const result=await api.boot();applyLibrary(result.library);$('#version').textContent=`桌面版 ${result.version}`;if(result.loadError)toast(result.loadError);await showPage();});
