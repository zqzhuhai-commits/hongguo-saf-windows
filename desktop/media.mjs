// SPDX-License-Identifier: GPL-3.0-only
import http from 'node:http';
import {randomBytes} from 'node:crypto';

export function byteRange(value,total) {
  if (!value) return [0,total-1];
  const m = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!m || (!m[1] && !m[2])) return null;
  const start = m[1] ? Number(m[1]) : Math.max(0,total-Number(m[2]));
  const end = m[1] ? m[2] ? Math.min(Number(m[2]),total-1) : total-1 : total-1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start>=0 && start<=end && start<total ? [start,end] : null;
}

export async function startMediaServer(provider) {
  const secret = randomBytes(24).toString('hex');
  let active = 0;
  const server = http.createServer(async (req,res) => {
    const path = new URL(req.url || '/','http://localhost').pathname;
    const match = new RegExp(`^/${secret}/(\\d{1,30})/(480|720|1080)$`).exec(path);
    if (!match || !['GET','HEAD'].includes(req.method)) {res.writeHead(404); return res.end();}
    if (active>=4) {res.writeHead(503); return res.end();}
    active++;
    try {
      const stream = await provider.stream(match[1],Number(match[2]));
      if (res.destroyed) return;
      const range = byteRange(req.headers.range,stream.total);
      if (!range) {res.writeHead(416,{'Content-Range':`bytes */${stream.total}`}); return res.end();}
      const [start,end] = range, chunkSize = 1024*1024;
      const first = req.method === 'HEAD' ? null : await stream.chunk(start,Math.min(start+chunkSize-1,end));
      if (res.destroyed) return;
      const headers = {'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':end-start+1,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
      if (req.headers.range) headers['Content-Range'] = `bytes ${start}-${end}/${stream.total}`;
      res.writeHead(req.headers.range?206:200,headers);
      if (req.method==='HEAD') return res.end();
      for (let offset=start;offset<=end && !res.destroyed;offset+=chunkSize) {
        const chunk = offset===start ? first : await stream.chunk(offset,Math.min(offset+chunkSize-1,end));
        if (res.destroyed) break;
        if (!res.write(chunk)) await new Promise(resolve => {
          const done = () => {res.off('drain',done); res.off('close',done); resolve();};
          res.once('drain',done); res.once('close',done);
        });
      }
      res.end();
    } catch {
      if (res.headersSent) res.destroy();
      else {res.writeHead(502,{'Content-Type':'text/plain; charset=utf-8'}); res.end('视频暂不可用，请重新播放或更换清晰度');}
    } finally {active--;}
  });
  server.requestTimeout = 0;
  await new Promise((resolve,reject) => {server.once('error',reject); server.listen(0,'127.0.0.1',resolve);});
  return {url:(id,quality) => `http://127.0.0.1:${server.address().port}/${secret}/${id}/${quality}`,
    close() {server.closeAllConnections(); server.close();}};
}
