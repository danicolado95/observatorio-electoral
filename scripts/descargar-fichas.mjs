import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createHash} from 'node:crypto';
const root=new URL('../data/pipeline-test/wikipedia/',import.meta.url),dir=new URL('fichas/',root);await mkdir(dir,{recursive:true});
const manifest=JSON.parse(await readFile(new URL('em-evidence.json',root)));
const urls=[...new Set(manifest.flatMap(e=>e.images.length?e.images:e.all_images).map(u=>u.replace(/-\d+x\d+(?=\.)/,'')))];
const result=[];
for(const url of urls){const name=createHash('sha256').update(url).digest('hex')+new URL(url).pathname.match(/\.[^.]+$/)[0];let status=200;try{await readFile(new URL(name,dir));}catch{try{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});status=r.status;if(r.ok)await writeFile(new URL(name,dir),Buffer.from(await r.arrayBuffer()));}catch{status=0;}}result.push({url,name,status});console.log(result.length,urls.length,status);}
await writeFile(new URL('index.json',dir),JSON.stringify(result,null,2));
