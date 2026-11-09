import {isDeepStrictEqual} from 'node:util';
import {esVarianteSW,motivoSW} from './revision-sw.mjs';
import {createHash} from 'node:crypto';
import {conservarReferencias} from './referencias-historicas.mjs';
// Construcción local: una marca no transmite aprobación a nuevas oleadas.
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {validate,deduplicate} from './update.mjs';
const root=process.env.ELECTOGRAFICA_TEST_ROOT?new URL('file:///'+process.env.ELECTOGRAFICA_TEST_ROOT.replaceAll('\\','/')+'/'):new URL('../',import.meta.url);
const incidencias=[],fuentes=[];
const issue=(tipo,codigo,evidencia,estudio_id=null)=>incidencias.push({tipo,codigo,evidencia,estudio_id,etapa:'preparacion',fuente:'wikipedia'});
const read=async(p,fallback,{optional=false}={})=>{try{const raw=await readFile(new URL(p,root),'utf8'),v=JSON.parse(raw);fuentes.push({archivo:p,estado:'legible',sha256:createHash('sha256').update(raw).digest('hex'),registros:v.encuestas?.length??v.approved?.length??null});
for(const [k,value] of Object.entries(fallback))if(Array.isArray(value)&&!Array.isArray(v?.[k]))throw Error('Estructura inválida: '+k);
return v;}catch(e){fuentes.push({archivo:p,estado:'no_disponible'});if(!(e.code==='ENOENT'&&(optional||p==='data/pipeline-test/wikipedia/radar.json')))issue('error','LECTURA_INVALIDA',p+': '+e.message);return fallback;}};
async function preparar(){try {
const staging=await read('data/pipeline-test/wikipedia/staging.json',{encuestas:[],quarantine:[],report:{}});
const original=await read('data/radar.json',{encuestas:[]});
let review={approved:[],audit:[]};
try{review=await read('data/historico-revisado.json',{approved:[],audit:[]});}catch(e){if(e.code!=='ENOENT')throw e;}
const checked=(rows,fuente,{quarantine=false}={})=>{const seen=new Set();return rows.filter(p=>{
 if(!p||typeof p.estudio_id!=='string'||!p.resultados||typeof p.resultados!=='object'){issue('error','REGISTRO_INVALIDO',fuente+': identidad/resultados inválidos',p?.estudio_id);return false;}
 if(seen.has(p.estudio_id))issue(quarantine?'cuarentena':'error','ID_DUPLICADO',fuente+': '+p.estudio_id,p.estudio_id);
 seen.add(p.estudio_id);return true;
});};
staging.encuestas=checked(staging.encuestas,'staging');staging.quarantine=checked(staging.quarantine,'cuarentena',{quarantine:true});
review.approved=checked(review.approved,'revisados');original.encuestas=checked(original.encuestas,'original');
const originals=await read('data/originales-huecos.json',{encuestas:[]});
const blocked=new Set(review.audit.filter(a=>a.decision==='cuarentena').map(a=>a.estudio_id));
const approved=new Map(review.approved.map(p=>[p.estudio_id,p]));
const auditedFields=['resultados','trabajo_campo_fin','instituto','fuente','fecha_publicacion','tamano_muestra'];
for(const p of [...staging.encuestas,...staging.quarantine]){
 const a=approved.get(p.estudio_id);
 if(!a)continue;
 const expected={...a};
 for(const [field,original] of [['fecha_publicacion','fecha_publicacion_tabla_original'],['tamano_muestra','muestra_tabla_original']]){
  if(Object.hasOwn(a,original))expected[field]=a[original];
 }
 const differences=Object.fromEntries(auditedFields.filter(k=>!isDeepStrictEqual(expected[k],p[k]))
  .map(k=>[k,{auditado:expected[k],observado:p[k]}]));
 if(Object.keys(differences).length){
  issue('cuarentena','REVISION_MODIFICADA',JSON.stringify({revision:p.ingestion?.revision,sha256:p.ingestion?.sha256,differences}),p.estudio_id);
 }
}
const published=await read('data/pipeline-test/electografica/before.json',{encuestas:[]},{optional:true});
const candidates=new Map();
for(const p of staging.encuestas){
 if(esVarianteSW(p,published,'wikipedia')){
  issue('cuarentena','REPUBLICACION_DOCUMENTADA',motivoSW,p.estudio_id);
 }else if(!blocked.has(p.estudio_id))candidates.set(p.estudio_id,p);
}
for(const p of approved.values())candidates.set(p.estudio_id,p);
// Revisiones manuales de originales: un escenario por estudio, sin heredar
// porcentajes de tablas secundarias ni habilitar ninguna descarga automática.
for(const p of originals.encuestas){try{
 if(p.verificacion?.estado!=='verificado-original' || !p.evidencia_publica?.length || /electografica|electograph/.test(new URL(p.fuente).hostname)){issue('error','ORIGINAL_NO_VERIFICADO','Original sin verificar: '+p.estudio_id,p.estudio_id);continue;}
 blocked.delete(p.estudio_id);
 candidates.set(p.estudio_id,p);
}catch(e){issue('error','ORIGINAL_INVALIDO',e.message,p?.estudio_id);}
}
const accepted=[],rejected=[];
for(const raw of candidates.values()){
 const p={...raw,fecha_fin_campo:raw.trabajo_campo_fin,tipo_fecha:raw.fecha_publicacion?'publicacion':'fin_campo'};
 try{accepted.push(validate(p,{id:'wikipedia-staging',allowedHosts:[new URL(p.fuente).hostname],allowHistoricalMetadata:true},staging.report.today));}
 catch(e){issue('error','CANDIDATO_INVALIDO',e.message,p.estudio_id);rejected.push({estudio_id:p.estudio_id,instituto:p.instituto,reason:e.message});}
}
if(!accepted.length)issue('error','STAGING_VACIO','Staging vacío');
for(const p of staging.quarantine)issue('cuarentena','STAGING_CUARENTENA',JSON.stringify(p.quarantine_reasons),p.estudio_id);
const target=new URL('data/pipeline-test/wikipedia/radar.json',root);
let previous=[];try{previous=(await read('data/pipeline-test/wikipedia/radar.json',{encuestas:[]})).encuestas;}catch(e){if(e.code!=='ENOENT')throw e;}
const rows=new Map([...original.encuestas,...previous].filter(p=>!blocked.has(p.estudio_id)).map(p=>[p.estudio_id,p]));
for(const p of accepted){
 const old=rows.get(p.estudio_id);
 let conflict=false;
 if(old)for(const key of ['instituto','ambito','tipo','fecha_publicacion','trabajo_campo_inicio','trabajo_campo_fin','tamano_muestra','fuente'])if(old[key]!==p[key]){issue('error','METADATO_HISTORICO_MODIFICADO','Conflicto histórico: '+p.estudio_id+'.'+key,p.estudio_id);conflict=true;}
 if(conflict)continue;
 if(old && !isDeepStrictEqual(old.resultados,p.resultados)){issue('error','CONFLICTO_HISTORICO','Conflicto histórico: '+p.estudio_id,p.estudio_id);continue;}
 if(old?.fuentes_adicionales?.length)try{conservarReferencias([p],[old]);}catch(e){for(const i of e.informe?.incidencias||[])issue('error',i.codigo,i.evidencia,p.estudio_id);continue;}
 // El hash de descarga identifica una observación de la página, no una revisión del sondeo.
 // Si identidad y resultados no cambiaron, la procedencia canónica anterior se conserva.
 rows.set(p.estudio_id,old?{...old,...(p.fuentes_adicionales?{fuentes_adicionales:p.fuentes_adicionales}:{})}:p);
}
const fields=new Map();
for(const p of rows.values()){
 if(typeof p.instituto!=='string'){issue('error','INSTITUTO_INVALIDO','Instituto ausente',p.estudio_id);continue;}
 const key=[p.instituto.toUpperCase(),p.trabajo_campo_inicio,p.trabajo_campo_fin].join('|');
 if(fields.has(key)&&fields.get(key)!==p.estudio_id)issue('error','REPUBLICACION','Posible republicación: '+key,p.estudio_id);
 fields.set(key,p.estudio_id);
}
const encuestas=deduplicate([...rows.values()].map(p=>({...p,fecha_fin_campo:p.trabajo_campo_fin,tipo_fecha:p.fecha_publicacion?'publicacion':'fin_campo'})));
const result={version:1,encuestas,attribution:staging.attribution,status:{state:'staging',message:'Histórico ampliado y auditado por registro. Vista local; cobertura parcial.',lastAttempt:null,lastSuccess:null,lastDataChange:null},import_report:{...staging.report,strict_accepted:accepted.length,strict_rejected:rejected,reviewed:review.audit.length,em_accepted:accepted.filter(p=>p.instituto==='EM-Analytics').length,existing:original.encuestas.length}};
await mkdir(new URL('data/pipeline-test/wikipedia/',root),{recursive:true});
if(incidencias.some(i=>i.tipo==='error')){issue('no_evaluable','RADAR_NO_PROMOVIDO','Lote bloqueado');return;}
await writeFile(new URL(target.href+'.tmp'),JSON.stringify(result,null,2)+'\n');await rename(new URL(target.href+'.tmp'),target);
console.log(JSON.stringify({accepted:accepted.length,rejected:rejected.length,total:encuestas.length,institutes:new Set(accepted.map(p=>p.instituto)).size}));

}catch(e){issue('error','ESTRUCTURA_INVALIDA',e.message);}finally{
// Imprimir antes de escribir: también queda evidencia si falla el disco.
for(const i of incidencias.filter(i=>i.tipo==='error'))console.error(`[Wikipedia ${i.codigo}] ${i.evidencia}${i.estudio_id?' ('+i.estudio_id+')':''}`);
if(incidencias.some(i=>i.tipo==='error'))console.error('Wikipedia: lote bloqueado; consultar data/pipeline-test/wikipedia/diagnostico.json');
await mkdir(new URL('data/pipeline-test/wikipedia/',root),{recursive:true});
await writeFile(new URL('data/pipeline-test/wikipedia/diagnostico.json',root),JSON.stringify({etapa:'preparacion-wikipedia',validado:!incidencias.some(i=>i.tipo==='error'),incidencias,fuentes},null,2)+'\n');
if(incidencias.some(i=>i.tipo==='error'))process.exitCode=1;
}}
await preparar();

