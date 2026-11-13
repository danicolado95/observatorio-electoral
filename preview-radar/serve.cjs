'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
 const target=path.resolve(root,'.'+(name.endsWith('/')?name+'index.html':name));
 if(!target.startsWith(root+path.sep)||name.split('/').some(p=>p.startsWith('.'))){res.writeHead(403).end();return;}
 fs.readFile(target,(err,body)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',target.endsWith('.json')?'application/json':/\.m?js$/.test(target)?'text/javascript; charset=utf-8':target.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');res.end(body);});
});
if(require.main===module)server.listen(8092,'127.0.0.1',()=>console.log('Vista local: http://127.0.0.1:8092/preview-radar/#electorado'));
module.exports=server;
