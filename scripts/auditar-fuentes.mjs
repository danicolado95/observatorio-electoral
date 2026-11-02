// Lectura de publicaciones originales; caché local por URL, sin feeds de terceros.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../data/pipeline-test/wikipedia/',import.meta.url);
const staging=JSON.parse(await readFile(new URL('staging.json',root)));
const rows=[...staging.encuestas,...staging.quarantine].filter(p=>['EM-Analytics','InvyMark','More in Common','Sondaxe','Winston'].includes(p.instituto)||!p.fecha_publicacion||p.tamano_muestra===null);
const dir=new URL('primary/',root);await mkdir(dir,{recursive:true});
const urls=[...new Set(rows.flatMap(p=>p.referencias.map(r=>r.url)).filter(u=>u&&!/electografica|electograph/.test(u)))];
const out=[];
for(const url of urls){
 const key=createHash('sha256').update(url).digest('hex');
 const path=new URL(key+'.json',dir);let entry;
 try{entry=JSON.parse(await readFile(path));if(entry.error)throw Error('retry');}catch{
  try{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});const raw=Buffer.from(await r.arrayBuffer());
   const html=raw.toString('utf8');const main=html.match(/<article\b[\s\S]*?<\/article>/i)?.[0]||html;
   const text=main.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&[a-z]+;/gi,' ').replace(/\s+/g,' ').trim();
   const images=[...main.matchAll(/<img\b[^>]*>/gi)].map(m=>m[0]).filter(s=>/ficha|tecnica|técnica|ft[-_]|metodolog/i.test(s));
   entry={url,final_url:r.url,status:r.status,retrieved_at:new Date().toISOString(),sha256:createHash('sha256').update(raw).digest('hex'),text,images};
   await writeFile(new URL(key+(r.headers.get('content-type')?.includes('pdf')?'.pdf':'.html'),dir),raw);
  }catch(e){entry={url,error:e.message};}
  await writeFile(path,JSON.stringify(entry,null,2));
 }
 out.push(entry);console.log(out.length+'/'+urls.length,entry.status||entry.error,url);
}
await writeFile(new URL('primary-index.json',root),JSON.stringify(out.map(({text,images,...e})=>e),null,2));
