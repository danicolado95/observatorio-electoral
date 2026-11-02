import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verificar} from './validar-integracion-manual.mjs';
const files=['wikipedia/staging.json','wikipedia/radar.json','electografica/audit.json','electografica/quarantine.json'];
const read=async p=>JSON.parse(await readFile(p,'utf8'));
export async function restore(statePath){
 const state=await read(statePath);
 assert.equal(state._pipeline?.version,1,'Estado persistente ausente o incompatible');
 assert(Array.isArray(state.encuestas)&&state.encuestas.length,'Histórico vacío');
 for(const name of files){
  const value=state._pipeline.files[name];assert(value,'Falta estado '+name);
  const target='data/pipeline-test/'+name;await mkdir(dirname(target),{recursive:true});await writeFile(target,JSON.stringify(value));
 }
 const {_pipeline,...radar}=state;
 for(const name of ['electografica/radar.json','electografica/before.json'])await writeFile('data/pipeline-test/'+name,JSON.stringify(radar));
}
export async function promote(statePath){
 const dir='data/pipeline-test/';
 for(const source of ['wikipedia','electografica'])assert.equal((await read(dir+source+'/diagnostico.json')).validado,true,'Fuente no validada: '+source);
 const combinado=await read(dir+'electografica/radar.json');
 const data={combinado,original:await read('data/radar.json'),desarrollo:await read('data/radar-desarrollo.json'),cis:await read('data/cis-historico.json'),wikipedia:await read(dir+'wikipedia/radar.json'),reporte:await read(dir+'electografica/report.json'),auditoria:await read(dir+'electografica/audit.json'),cuarentena:await read(dir+'electografica/quarantine.json')};
 const audit=verificar(data);
 let previous=null;try{previous=await read(statePath);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(previous){assert.equal(previous._pipeline?.version,1);verificar({...data,original:previous});}
 const known=previous?._pipeline?.files['electografica/quarantine.json']??await read('data/radar-cuarentena-base.json');
 const lastQuarantine=new Set(known.map(e=>JSON.stringify([e.id,e.title,e.reason])));
 // An unrecognised new national poll must fail visibly rather than silently disappear.
 const pending=data.cuarentena.filter(q=>!lastQuarantine.has(JSON.stringify([q.id,q.title,q.reason]))&&!q.reconciliacion&&/^ESPAÑA:/.test(q.title||'')&&!/^(CIS\/modelo|Fuera del periodo|Ámbito regional)/.test(q.reason));
 assert.equal(pending.length,0,'Nuevas encuestas nacionales en cuarentena: '+pending.map(q=>q.title+': '+q.reason).join('; '));
 const stateFiles={};for(const name of files)stateFiles[name]=await read(dir+name);
 const changed=JSON.stringify(previous?.encuestas)!==JSON.stringify(combinado.encuestas);
 const now=new Date().toISOString();
 const result={...combinado,status:{state:'ok',message:'Radar de pruebas actualizado automáticamente. Electográfica tiene prioridad; histórico validado.',lastAttempt:now,lastSuccess:now,lastDataChange:changed?now:previous.status.lastDataChange},_pipeline:{version:1,files:stateFiles}};
 await mkdir(dirname(statePath),{recursive:true});await writeFile(statePath+'.tmp',JSON.stringify(result)+'\n');await rename(statePath+'.tmp',statePath);
 const summary={validado:audit.validado,total:result.encuestas.length,privadas:audit.privadas,cis:audit.cis,newIds:result.encuestas.filter(p=>!previous?.encuestas.some(q=>q.estudio_id===p.estudio_id)).map(p=>p.estudio_id),dataChanged:changed,checkedAt:now};
 await writeFile(dir+'publicacion-resumen.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [mode,statePath]=process.argv.slice(2);assert(statePath,'Falta archivo persistente');
 if(mode==='restore')await restore(statePath);else if(mode==='promote')await promote(statePath);else throw Error('Modo inválido');
}

