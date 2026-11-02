import {conservarReferencias} from './referencias-historicas.mjs';
// Construcción local: una marca no transmite aprobación a nuevas oleadas.
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {validate,deduplicate} from './update.mjs';
const root=new URL('../',import.meta.url);
const read=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const staging=await read('data/pipeline-test/wikipedia/staging.json');
const original=await read('data/radar.json');
let review={approved:[],audit:[]};
try{review=await read('data/historico-revisado.json');}catch(e){if(e.code!=='ENOENT')throw e;}
const blocked=new Set(review.audit.filter(a=>a.decision==='cuarentena').map(a=>a.estudio_id));
const approved=new Map(review.approved.map(p=>[p.estudio_id,p]));
for(const p of [...staging.encuestas,...staging.quarantine]){
 const a=approved.get(p.estudio_id);
 if(a && (JSON.stringify(p.resultados)!==JSON.stringify(a.resultados)||p.trabajo_campo_fin!==a.trabajo_campo_fin||p.instituto!==a.instituto||p.fuente!==a.fuente||p.fecha_publicacion!==(Object.hasOwn(a,'fecha_publicacion_tabla_original')?a.fecha_publicacion_tabla_original:a.fecha_publicacion)||p.tamano_muestra!==(Object.hasOwn(a,'muestra_tabla_original')?a.muestra_tabla_original:a.tamano_muestra)))throw Error('Revisión de registro auditado: '+p.estudio_id);
}
const candidates=new Map(staging.encuestas.filter(p=>!blocked.has(p.estudio_id)).map(p=>[p.estudio_id,p]));
for(const p of approved.values())candidates.set(p.estudio_id,p);
// Revisiones manuales de originales: un escenario por estudio, sin heredar
// porcentajes de tablas secundarias ni habilitar ninguna descarga automática.
const originals=await read('data/originales-huecos.json');
for(const p of originals.encuestas){
 if(p.verificacion?.estado!=='verificado-original' || !p.evidencia_publica?.length || /electografica|electograph/.test(new URL(p.fuente).hostname))throw Error('Original sin verificar: '+p.estudio_id);
 blocked.delete(p.estudio_id);
 candidates.set(p.estudio_id,p);
}
const accepted=[],rejected=[];
for(const raw of candidates.values()){
 const p={...raw,fecha_fin_campo:raw.trabajo_campo_fin,tipo_fecha:raw.fecha_publicacion?'publicacion':'fin_campo'};
 try{accepted.push(validate(p,{id:'wikipedia-staging',allowedHosts:[new URL(p.fuente).hostname],allowHistoricalMetadata:true},staging.report.today));}
 catch(e){rejected.push({estudio_id:p.estudio_id,instituto:p.instituto,reason:e.message});}
}
if(!accepted.length)throw Error('Staging vacío');
const target=new URL('data/pipeline-test/wikipedia/radar.json',root);
let previous=[];try{previous=(await read('data/pipeline-test/wikipedia/radar.json')).encuestas;}catch(e){if(e.code!=='ENOENT')throw e;}
const rows=new Map([...original.encuestas,...previous].filter(p=>!blocked.has(p.estudio_id)).map(p=>[p.estudio_id,p]));
for(const p of accepted){
 const old=rows.get(p.estudio_id);
 if(old && JSON.stringify(old.resultados)!==JSON.stringify(p.resultados))throw Error('Conflicto histórico: '+p.estudio_id);
 if(old?.fuentes_adicionales?.length)conservarReferencias([p],[old]);
 rows.set(p.estudio_id,p);
}
const fields=new Map();
for(const p of rows.values()){
 const key=[p.instituto.toUpperCase(),p.trabajo_campo_inicio,p.trabajo_campo_fin].join('|');
 if(fields.has(key)&&fields.get(key)!==p.estudio_id)throw Error('Posible republicación: '+key);
 fields.set(key,p.estudio_id);
}
const encuestas=deduplicate([...rows.values()].map(p=>({...p,fecha_fin_campo:p.trabajo_campo_fin,tipo_fecha:p.fecha_publicacion?'publicacion':'fin_campo'})));
const result={version:1,encuestas,attribution:staging.attribution,status:{state:'staging',message:'Histórico ampliado y auditado por registro. Vista local; cobertura parcial.',lastAttempt:null,lastSuccess:null,lastDataChange:null},import_report:{...staging.report,strict_accepted:accepted.length,strict_rejected:rejected,reviewed:review.audit.length,em_accepted:accepted.filter(p=>p.instituto==='EM-Analytics').length,existing:original.encuestas.length}};
await mkdir(new URL('data/pipeline-test/wikipedia/',root),{recursive:true});
await writeFile(new URL(target.href+'.tmp'),JSON.stringify(result,null,2)+'\n');await rename(new URL(target.href+'.tmp'),target);
console.log(JSON.stringify({accepted:accepted.length,rejected:rejected.length,total:encuestas.length,institutes:new Set(accepted.map(p=>p.instituto)).size}));
