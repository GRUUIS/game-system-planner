const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.join(__dirname, 'public');
const data = process.env.PLANNER_DATA_DIR ? path.resolve(process.env.PLANNER_DATA_DIR) : path.join(__dirname, 'data');
const port = Number(process.env.PORT || 4317);
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.woff2':'font/woff2','.png':'image/png'};
let writeQueue = Promise.resolve();
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if(url.pathname==='/api/export' && req.method==='POST'){
      res.setHeader('Content-Type','application/json; charset=utf-8');
      if(req.headers.origin && req.headers.origin!==`http://${req.headers.host}`){res.writeHead(403);res.end('{}');return;}
      if(!req.headers['content-type']?.startsWith('application/json')){res.writeHead(415);res.end('{}');return;}
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>64*1024*1024){res.writeHead(413);res.end('{"error":"导出内容超过 64 MB"}');return;}}
      const {name,content}=JSON.parse(body);
      if(typeof name!=='string'||name!==path.basename(name)||!['.html','.md','.svg','.sysplan'].includes(path.extname(name))||typeof content!=='string'){res.writeHead(400);res.end('{"error":"导出格式不支持"}');return;}
      const output=path.join(__dirname,'exports');await fs.mkdir(output,{recursive:true});
      const ext=path.extname(name),stamp=new Date().toISOString().replace(/[:.]/g,'-');
      const fileName=name.slice(0,-ext.length)+'_'+stamp+ext;
      await fs.writeFile(path.join(output,fileName),content,'utf8');res.end(JSON.stringify({fileName}));return;
    }
    if (url.pathname === '/api/project') {
      res.setHeader('Content-Type','application/json; charset=utf-8');
      res.setHeader('Cache-Control','no-store');
      if (req.method === 'GET') {
        try { res.end(await fs.readFile(path.join(data,'project.json'))); }
        catch (e) { if(e.code === 'ENOENT') res.end('null'); else throw e; }
        return;
      }
      if (req.method === 'PUT') {
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
          res.writeHead(403); res.end('{"error":"不允许跨站写入"}'); return;
        }
        if(!req.headers['content-type']?.startsWith('application/json')) { res.writeHead(415); res.end('{}'); return; }
        let body='';
        for await (const chunk of req) { body+=chunk; if(Buffer.byteLength(body)>64*1024*1024){res.writeHead(413);res.end('{"error":"项目超过 64 MB，请拆分项目"}');return;} }
        const project=JSON.parse(body);
        if(project.format!=='system-planner-v1' || !Array.isArray(project.boards)) {res.writeHead(400);res.end('{"error":"不是有效的策划项目"}');return;}
        writeQueue = writeQueue.catch(()=>{}).then(async()=>{
          await fs.mkdir(data,{recursive:true});
          const file=path.join(data,'project.json');
          try{await fs.copyFile(file,path.join(data,'project.previous.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
          await fs.writeFile(path.join(data,'project.tmp'),body,'utf8');
          await fs.rename(path.join(data,'project.tmp'),file);
        });
        await writeQueue;
        res.end('{"ok":true}'); return;
      }
      res.writeHead(405);res.end('{}');return;
    }
    const target=path.resolve(root,'.'+decodeURIComponent(['/', '/index.html'].includes(url.pathname)?'/workbench.template.html':url.pathname));
    if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');
    res.setHeader('Cache-Control','no-cache');
    res.end(await fs.readFile(target));
  }catch(e){res.writeHead(e.code==='ENOENT'?404:500);res.end(JSON.stringify({error:e.message}));}
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`端口 ${port} 已被使用。如果工具已经启动，请打开 http://127.0.0.1:${port}`:e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`策划工作台已启动：http://127.0.0.1:${port}\n关闭此窗口即可停止服务。`));
