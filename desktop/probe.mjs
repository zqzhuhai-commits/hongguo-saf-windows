// Real-content probe. A failed upstream probe is never replaced with test data.
import fs from 'node:fs';
import {provider} from './provider.mjs';
const result={date:new Date().toISOString(),checks:[]};
async function check(name,fn){try{const value=await fn();result.checks.push({name,ok:true,...value});return value;}catch(e){result.checks.push({name,ok:false,error:e.code || (/^[\u3400-\u9fff]/.test(e.message)&&!e.message.includes('http')?e.message:'UPSTREAM_UNAVAILABLE')});return null;}}
let selected;
for(const type of ['comic','short']) {
  const home=await check(type+':home',async()=>{const data=await provider.home(1,type);if(!data.items.length)throw new Error('内容为空');selected ||= data.items[0];return {count:data.items.length};});
  if(!home)continue;
  await check(type+':search',async()=>{const data=await provider.search(selected.title,1,type);return {count:data.items.length};});
}
if(selected){let detail;await check('detail',async()=>{detail=await provider.detail(selected.id);return {episodes:detail.episodes.length};});if(detail)await check('media-range',async()=>{const stream=await provider.stream(detail.episodes[0].id,720);const bytes=await stream.chunk(0,65535);if(bytes.length!==65536||bytes.toString('ascii',4,8)!=='ftyp')throw new Error('视频格式异常');return {bytes:bytes.length,quality:stream.quality};});}
const output=process.argv[2];if(output)fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(result.checks.some(row=>!row.ok))process.exitCode=1;
