import {esVarianteSW} from './revision-sw.mjs';
import {corregir40dB} from './original-40db.mjs';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verificar} from './validar-integracion-manual.mjs';
const files=['wikipedia/staging.json','wikipedia/radar.json','electografica/audit.json','electografica/quarantine.json'];
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
export function difference(before=[],after=[]){
 const old=new Map(before.map(p=>[p.estudio_id,p])),next=new Map(after.map(p=>[p.estudio_id,p]));
 return {added:after.filter(p=>!old.has(p.estudio_id)).map(p=>p.estudio_id),
  removed:before.filter(p=>!next.has(p.estudio_id)).map(p=>p.estudio_id),
  modified:after.filter(p=>old.has(p.estudio_id)&&JSON.stringify(stable(p))!==JSON.stringify(stable(old.get(p.estudio_id)))).map(p=>({id:p.estudio_id,fields:Object.keys({...old.get(p.estudio_id),...p}).filter(k=>JSON.stringify(stable(p[k]))!==JSON.stringify(stable(old.get(p.estudio_id)[k])))}))};
}
export async function restore(statePath){
 const state=await read(statePath);
 assert.equal(state._pipeline?.version,1,'Estado persistente ausente o incompatible');
 assert(Array.isArray(state.encuestas)&&state.encuestas.length,'Histórico vacío');
 for(const name of files){
  const value=state._pipeline.files[name];assert(value,'Falta estado '+name);
  const target='data/pipeline-test/'+name;await mkdir(dirname(target),{recursive:true});await writeFile(target,JSON.stringify(name==='wikipedia/radar.json'?corregir40dB(value):value));
 }
 const {_pipeline,...radar}=state;
 for(const name of ['electografica/radar.json','electografica/before.json'])await writeFile('data/pipeline-test/'+name,JSON.stringify(corregir40dB(radar)));
}
export async function promote(statePath){
 const dir='data/pipeline-test/';
 assert.equal((await read(dir+'electografica/diagnostico.json')).validado,true,'Electográfica no validada');
 let fallback=null;
 try{fallback=await read(dir+'wikipedia/fallback.json');}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!fallback)assert.equal((await read(dir+'wikipedia/diagnostico.json')).validado,true,'Wikipedia no validada');
 const combinado=await read(dir+'electografica/radar.json');
 const data={combinado,original:await read('data/radar.json'),desarrollo:await read('data/radar-desarrollo.json'),cis:await read('data/cis-historico.json'),wikipedia:await read(dir+'wikipedia/radar.json'),reporte:await read(dir+'electografica/report.json'),auditoria:await read(dir+'electografica/audit.json'),cuarentena:await read(dir+'electografica/quarantine.json')};
 const audit=verificar(data);
 let previous=null;try{previous=await read(statePath);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(previous){assert.equal(previous._pipeline?.version,1);verificar({...data,original:corregir40dB(previous)});}
 if(fallback){
  assert.equal(fallback.estado,'restaurado');
  assert(previous,'Wikipedia falló y no hay histórico publicado');
  for(const name of ['wikipedia/radar.json','wikipedia/staging.json']){
   assert.deepEqual(await read(dir+name),previous._pipeline.files[name],'Estado restaurado de Wikipedia distinto: '+name);
  }
 }
 const known=previous?._pipeline?.files['electografica/quarantine.json']??await read('data/radar-cuarentena-base.json');
 const lastQuarantine=new Set(known.map(e=>JSON.stringify([e.id,e.title,e.reason])));
 // An unrecognised new national poll must fail visibly rather than silently disappear.
 const pending=data.cuarentena.filter(q=>!lastQuarantine.has(JSON.stringify([q.id,q.title,q.reason]))&&!q.reconciliacion&&!esVarianteSW(q.candidate,previous,'electografica')&&/^ESPAÑA:/.test(q.title||'')&&!/^(CIS\/modelo|Fuera del periodo|Ámbito regional)/.test(q.reason));
 assert.equal(pending.length,0,'Nuevas encuestas nacionales en cuarentena: '+pending.map(q=>q.title+': '+q.reason).join('; '));
 const stateFiles={};for(const name of files)stateFiles[name]=await read(dir+name);
 const delta=difference(previous?.encuestas,combinado.encuestas);
 const changed=!!(delta.added.length||delta.removed.length||delta.modified.length);
 const now=new Date().toISOString();
 const result={...combinado,status:{state:fallback?'degraded':'ok',message:fallback?'Electográfica actualizada; Wikipedia conserva su última versión validada.':'Radar de pruebas actualizado automáticamente. Electográfica tiene prioridad; histórico validado.',lastAttempt:now,lastSuccess:now,lastDataChange:changed?now:previous.status.lastDataChange},_pipeline:{version:1,files:stateFiles}};
 await mkdir(dirname(statePath),{recursive:true});await writeFile(statePath+'.tmp',JSON.stringify(result)+'\n');await rename(statePath+'.tmp',statePath);
 const summary={validado:audit.validado,total:result.encuestas.length,privadas:audit.privadas,cis:audit.cis,newIds:delta.added,difference:delta,dataChanged:changed,checkedAt:now,wikipedia:fallback??{estado:'validado'}};
 await writeFile(dir+'publicacion-resumen.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [mode,statePath]=process.argv.slice(2);assert(statePath,'Falta archivo persistente');
 if(mode==='restore')await restore(statePath);else if(mode==='promote')await promote(statePath);else throw Error('Modo inválido');
}

