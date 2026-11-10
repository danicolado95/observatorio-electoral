import {conservarRevision} from './revisiones-electografica.mjs';
import {esVarianteSW,motivoSW} from './revision-sw.mjs';
import {extraerEntrada} from './extraer-electografica.mjs';
import {esHistoricoSigma, resolverElectografica, comprobarCuarentena} from './reconciliaciones-documentadas.mjs';
import {promoverLote} from './lote-atomico.mjs';
import {conservarReferencias, unirReferencias} from './referencias-historicas.mjs';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {parseArgs} from 'node:util';
import {validate} from './update.mjs';
const {values}=parseArgs({options:{'as-of':{type:'string'}}});
const asOf=values['as-of']??new Date().toISOString().slice(0,10);
const core=createRequire(import.meta.url)('../js/radar-core.js');
const root=process.env.ELECTOGRAFICA_TEST_ROOT?new URL('file:///'+process.env.ELECTOGRAFICA_TEST_ROOT.replaceAll('\\','/')+'/'):new URL('../',import.meta.url),dir=new URL('data/pipeline-test/electografica/',root);
const save=async(n,v)=>{const target=new URL(n,dir),tmp=new URL(n+'.tmp',dir);await writeFile(tmp,JSON.stringify(v,null,2)+'\n');await rename(tmp,target);};
const hash=s=>createHash('sha256').update(s).digest('hex');
const text=s=>s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]*>/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&nbsp;/g,' ').replace(/&middot;/g,'·').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const iso=(d,m,y)=>`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
function field(s){let m=s.match(/(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?[-–](\d{1,2})\/(\d{1,2})\/(20\d{2})/);if(m)return [iso(m[1],m[2],m[3]||m[6]),iso(m[4],m[5],m[6])];m=s.match(/(\d{1,2})(?:[-–](\d{1,2}))?\/(\d{1,2})\/(20\d{2})/);if(m)return [iso(m[1],m[3],m[4]),iso(m[2]||m[1],m[3],m[4])];return null;}
const alias={'40dB.':'40dB','SigmaDos':'Sigma Dos','IMOP Insights':'IMOP','NC-Report':'NC Report','Celeste Tel':'Celeste-Tel','ElectoPanel':'EM-Analytics'};
const canon=s=>(alias[s]||s).normalize('NFD').replace(/[\u0300-\u036f.\s-]/g,'').toUpperCase();
const party=s=>({'SE ACABÓ':'SALF','EH BILDU':'EH_BILDU','EAJ-PNV':'PNV','CCa':'CC','NA+/UPN':'UPN','ALIANÇA.CAT':'ALIANCA_CAT','ADELANTE ANDALUCÍA':'ADELANTE_ANDALUCIA'})[s]||s;
await mkdir(dir,{recursive:true});
const incidencias=[],cobertura=[],fuentes=[];
const issue=(tipo,codigo,evidencia,estudio_id=null,fuente='electografica')=>incidencias.push({tipo,codigo,evidencia,estudio_id,fuente,etapa:'importacion'});
const blocked=()=>incidencias.some(i=>i.tipo==='error');
const leer=async(p,fallback,optional=false)=>{try{const raw=await readFile(new URL(p,root),'utf8');const value=JSON.parse(raw);fuentes.push({archivo:p,estado:'legible',sha256:hash(raw),registros:Array.isArray(value)?value.length:value?.encuestas?.length??value?.feed?.entry?.length??null,referencias:value?.encuestas?.reduce((n,p)=>n+(p?.fuentes_adicionales?.length||0),0)??null});
 const array=p.endsWith('/audit.json');
 if(array?!Array.isArray(value):p.endsWith('/snapshot.json')?false:!Array.isArray(value?.encuestas))throw Error('Estructura inválida: '+p);
 if(!array&&!p.endsWith('/snapshot.json')){
  const seen=new Set();value.encuestas=value.encuestas.filter(poll=>{
   if(!poll||typeof poll.estudio_id!=='string'||typeof poll.instituto!=='string'||!poll.resultados||typeof poll.resultados!=='object'){issue('error','REGISTRO_INVALIDO','Identidad/resultados inválidos',poll?.estudio_id,p);return false;}
   if(seen.has(poll.estudio_id))issue('error','ID_DUPLICADO',poll.estudio_id,poll.estudio_id,p);
   seen.add(poll.estudio_id);return true;
  });
 }
 return value;}catch(e){fuentes.push({archivo:p,estado:optional&&e.code==='ENOENT'?'opcional_ausente':'error'});if(!optional||e.code!=='ENOENT')issue('error','LECTURA_INVALIDA',e.message,null,p);return structuredClone(fallback);}};
try {
if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!Number.isFinite(Date.parse(asOf))||new Date(asOf).toISOString().slice(0,10)!==asOf)throw Error('AsOf inválido: use YYYY-MM-DD');
const base=await leer('data/pipeline-test/wikipedia/radar.json',{encuestas:[]});
if(!Array.isArray(base.encuestas)){issue('error','ESTRUCTURA_INVALIDA','Wikipedia sin encuestas');base.encuestas=[];}
const heredadas=[];
const snapshot=await leer('data/pipeline-test/electografica/snapshot.json',null);
const previous=await leer('data/pipeline-test/electografica/radar.json',null,true);
// Una salida previa solo puede enriquecer Wikipedia con su auditoría cruzada intacta.
let previousAudit=[], previousQuarantine=[];
if(previous) {
 previousAudit=await leer('data/pipeline-test/electografica/audit.json',[],true);
 previousQuarantine=await readFile(new URL('data/pipeline-test/electografica/quarantine.json',root),'utf8')
  .then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
}
for(const poll of previous?.encuestas||[]){try{const existing=base.encuestas.find(p=>p.estudio_id===poll.estudio_id);if(!existing){

 const proofs=[...previousQuarantine,...(previous.reconciliaciones_anteriores||[])].filter(c=>c.reconciliacion?.historico?.estudio_id===poll.estudio_id);
 if(proofs.length || esHistoricoSigma(poll)) {
  if(!snapshot?.feed?.entry?.some(e=>e.id?.$t===poll.ingestion.entry_id)) {
   const wiki=base.encuestas.filter(q=>q.estudio_id===proofs[0]?.reconciliacion?.wikipedia?.estudio_id);
   if(proofs.length!==1||wiki.length!==1||!comprobarCuarentena(proofs[0],wiki[0],poll))throw Error('Reconciliación previa no comprobable');
   base.encuestas[base.encuestas.indexOf(wiki[0])]=structuredClone(poll);heredadas.push(proofs[0]);
  }
 } else {
 const wiki=base.encuestas.filter(q=>q.ingestion?.source==='wikipedia'&&canon(q.instituto)===canon(poll.instituto)&&(q.trabajo_campo_fin===poll.trabajo_campo_fin||q.fecha_publicacion===poll.fecha_publicacion||(q.fuente===poll.fuente&&Math.abs(Date.parse(q.trabajo_campo_fin)-Date.parse(poll.trabajo_campo_fin))<=7*86400000)));
 if(poll.ingestion?.source==='electografica'&&wiki.length){
  if(wiki.length!==1||!snapshot?.feed?.entry?.some(e=>e.id?.$t===poll.ingestion.entry_id))throw Error('Alias nuevo de Wikipedia sin entrada única verificable');
  // La entrada completa se cruza abajo: no añadir una segunda copia al radar.
 }else base.encuestas.push(poll);
}
}else{const start=incidencias.length;for(const k of ['instituto','fecha_publicacion','trabajo_campo_inicio','trabajo_campo_fin','tamano_muestra'])if(JSON.stringify(existing[k])!==JSON.stringify(poll[k]))issue('error','RECONCILIACION_PREVIA','Conflicto entre históricos: '+poll.estudio_id+'.'+k,poll.estudio_id);for(const [k,v] of Object.entries(poll.resultados))if(Object.hasOwn(existing.resultados,k)&&existing.resultados[k]!==v)issue('error','RECONCILIACION_PREVIA','Conflicto entre históricos: '+poll.estudio_id+'.resultados.'+k,poll.estudio_id);if(incidencias.length!==start)continue;const extras=Object.keys(poll.resultados).filter(k=>!Object.hasOwn(existing.resultados,k));if(extras.length){const proofs=previousAudit.filter(a=>a.decision==='cruzada'&&a.estudio_id===poll.estudio_id);if(proofs.length!==1)throw Error('Enriquecimiento previo sin auditoría única: '+poll.estudio_id);const a=proofs[0],e=a.extracted;if(!e||e.ingestion?.source!=='electografica'||a.id!==e.ingestion.entry_id||a.url!==e.url_electografica||!e.ingestion.content_sha256||!poll.fuentes_adicionales?.some(r=>r.source==='electografica'&&r.url===a.url&&r.sha256===e.ingestion.content_sha256&&r.original===e.fuente&&r.medio===e.medio)||['instituto','trabajo_campo_inicio','trabajo_campo_fin','fecha_publicacion','fuente','tamano_muestra'].some(k=>existing[k]!==e[k])||Object.entries(e.resultados).some(([k,v])=>poll.resultados[k]!==v)||extras.some(k=>!Object.hasOwn(e.resultados,k)))throw Error('Origen previo no comprobable: '+poll.estudio_id);}existing.resultados={...poll.resultados,...existing.resultados};if(poll.fuentes_adicionales?.length){existing.fuentes_adicionales=unirReferencias(poll.fuentes_adicionales,existing.fuentes_adicionales||[]);}}}
catch(e){issue('error','RECONCILIACION_PREVIA',e.message,poll?.estudio_id);}}
// El histórico versionado conserva procedencia aunque una entrada ya no cruce.
let historico;
historico=await leer('data/radar-desarrollo.json',null,true);
if(historico)try{conservarReferencias(base.encuestas,historico.encuestas);}catch(error){
 await save('referencias-validacion.json',error.informe??{validado:false,error:error.message});
 for(const i of error.informe?.incidencias||[])issue('error',i.codigo,i.evidencia,i.estudio_id,'historico');
 if(!error.informe)issue('error','REFERENCIAS_INVALIDAS',error.message);
}
const initialIds=new Set(base.encuestas.map(p=>p.estudio_id));
const before=await leer('data/pipeline-test/electografica/before.json',base,true);
const rows=structuredClone(base.encuestas),quarantine=[],audit=[],entries=new Map(),manifest=[];

if(snapshot?.complete!==true||!Number.isInteger(snapshot?.expected)||snapshot.expected<1||!Array.isArray(snapshot?.feed?.entry)||snapshot.feed.entry.length!==snapshot.expected)issue('error','SNAPSHOT_INCOMPLETO','Falta snapshot completo y no vacío');
for(const [index,e] of (Array.isArray(snapshot?.feed?.entry)?snapshot.feed.entry:[]).entries()){
 if(typeof e?.id?.$t!=='string'||!e.id.$t){issue('error','ENTRADA_SIN_ID','Entrada '+index);cobertura.push({indice:index,id:null,decision:'error'});continue;}
 if(entries.has(e.id.$t)){issue('error','ID_DUPLICADO',e.id.$t,e.id.$t);cobertura.push({indice:index,id:e.id.$t,decision:'error'});continue;}
 entries.set(e.id.$t,e);
}
if(snapshot)manifest.push({file:'snapshot.json',sha256:hash(JSON.stringify(snapshot)),entries:entries.size});
if(!entries.size)issue('no_evaluable','FEED_NO_EVALUABLE','No hay entradas evaluables');
for(const e of entries.values()){
 const record={id:e.id.$t};let candidate;const problemas=[];
 try{
 const title=e.title?.$t,url=e.link?.find(l=>l.rel==='alternate')?.href;Object.assign(record,{title,url});
 const p=extraerEntrada(e,asOf);
 if(esVarianteSW(p,previous,'electografica')){
  quarantine.push({...record,reason:motivoSW,candidate:p});
  issue('cuarentena','REPUBLICACION_DOCUMENTADA',motivoSW,record.id);
  continue;
 }
  record.extracted=p;candidate=p;const matches=rows.filter(q=>canon(q.instituto)===canon(p.instituto)&&(q.trabajo_campo_fin===p.trabajo_campo_fin||q.fecha_publicacion===p.fecha_publicacion||(q.fuente===p.fuente&&Math.abs(Date.parse(q.trabajo_campo_fin)-Date.parse(p.trabajo_campo_fin))<=7*86400000)));
  const revision=conservarRevision(p,matches,previous,previousAudit,previousQuarantine);
  if(revision){
   rows[rows.indexOf(matches[0])]=structuredClone(revision.canonical);
   const prueba={candidato:p,entrada:e};
   if(revision.audit) audit.push({...revision.audit,revision_no_promovida:prueba});
   else quarantine.push({...revision.quarantine,revision_no_promovida:prueba});
   issue('cuarentena','REVISION_ELECTOGRAFICA_CONSERVADA','Revisión externa archivada; conserva la encuesta previamente auditada',record.id);
   continue;
  }
  if(matches.length){
   const exact=matches.length===1&&matches[0].trabajo_campo_fin===p.trabajo_campo_fin&&Object.keys(p.resultados).every(k=>!Object.hasOwn(matches[0].resultados,k)||matches[0].resultados[k]===p.resultados[k])?matches[0]:null;
   if(!exact){
    const historicos=[...new Map([...(historico?.encuestas||[]),...(previous?.encuestas||[])].filter(h=>h.estudio_id===p.estudio_id).map(h=>[h.estudio_id,h])).values()];
    // La regla no autoriza reescribir otros registros ya versionados.
    const versionado=(historico?.encuestas||[]).some(h=>h.estudio_id===matches[0]?.estudio_id);
    const yaExtraido=audit.some(a=>a.estudio_id===matches[0]?.estudio_id)||quarantine.some(c=>c.reconciliacion?.historico?.estudio_id===matches[0]?.estudio_id);
    const r=!versionado&&!yaExtraido&&historicos.length<=1&&matches.length===1?resolverElectografica(historicos[0]??null,matches[0],p,e):null;
    if(r){
      rows[rows.indexOf(matches[0])]=structuredClone(r.historico);
      quarantine.push({...record,reason:'Versión incompatible reconocida; original Wikipedia conservado en reconciliacion.wikipedia',candidate:p,matches:[structuredClone(matches[0])],reconciliacion:r});
      issue('cuarentena','RECONCILIACION_DOCUMENTADA',r.motivo,record.id);
      continue;
    }
    throw Error('Conflicto con registro existente: '+matches.map(q=>q.estudio_id).join(','));
   }
   if(exact.fecha_publicacion!==p.fecha_publicacion)throw Error('Discrepancia de publicación: '+exact.estudio_id);
   if(exact.url_electografica===url){audit.push({...record,decision:'alta',estudio_id:exact.estudio_id});continue;}
   if(Object.keys(p.resultados).some(k=>!Object.hasOwn(exact.resultados,k))&&['instituto','trabajo_campo_inicio','trabajo_campo_fin','fecha_publicacion','fuente','tamano_muestra'].some(k=>exact[k]!==p[k]))throw Error('Identidad no homologada para enriquecimiento');
   const referencias=unirReferencias(exact.fuentes_adicionales||[],[{source:'electografica',url,original:p.fuente,medio:p.medio,sha256:p.ingestion.content_sha256}]);
   exact.resultados={...exact.resultados,...p.resultados};
   exact.fuentes_adicionales=referencias;audit.push({...record,decision:'cruzada',estudio_id:exact.estudio_id});
  }else{rows.push(p);audit.push({...record,decision:'alta',estudio_id:p.estudio_id});}
 }catch(error){if(error.problemas)problemas.push(...error.problemas);const tipo=/^(Ámbito regional|CIS\/modelo|Fuera del periodo)/.test(error.message)?'exclusion_esperada':'cuarentena';if(problemas.length)for(const p of problemas)issue(tipo,p.codigo,p.evidencia,record.id);else issue(tipo,tipo==='cuarentena'?'CANDIDATO_RECHAZADO':'FUERA_DE_ALCANCE',error.message,record.id);quarantine.push({...record,reason:error.message,candidate,matches:candidate?rows.filter(q=>canon(q.instituto)===canon(candidate.instituto)&&(q.trabajo_campo_fin===candidate.trabajo_campo_fin||q.fecha_publicacion===candidate.fecha_publicacion||q.fuente===candidate.fuente)).map(q=>({estudio_id:q.estudio_id,trabajo_campo_inicio:q.trabajo_campo_inicio,trabajo_campo_fin:q.trabajo_campo_fin,fecha_publicacion:q.fecha_publicacion,resultados:q.resultados,fuente:q.fuente})):[]});}
}
const output={...base,reconciliaciones_anteriores:heredadas,encuestas:rows,status:{...base.status,message:'Histórico local Wikipedia + Electográfica; conflictos en cuarentena.'}};
await save('intento-manifest.json',manifest);await save('intento-quarantine.json',quarantine);await save('intento-audit.json',audit);
for(const e of entries.values())cobertura.push({id:e.id.$t,decision:audit.find(a=>a.id===e.id.$t)?.decision??incidencias.find(i=>i.estudio_id===e.id.$t)?.tipo??'no_evaluable'});

const stats=data=>{const priv=core.select(data.encuestas,false);const series={};for(const cis of [false,true])for(const party of ['PP','PSOE','VOX','SUMAR']){const points=new Map(core.medianTrend(core.select(data.encuestas,cis),party,asOf).map(p=>[p.date,p]));let valid=0,max=0,run=0;for(let t=Date.parse('2023-07-23');t<=Date.parse(asOf);t+=86400000){if(points.get(new Date(t).toISOString().slice(0,10))?.value!=null){valid++;run=0;}else{run++;max=Math.max(max,run);}}series[(cis?'ON_':'OFF_')+party]={valid_days:valid,max_gap_days:max};}return {private:priv.length,cis:data.encuestas.length-priv.length,institutes:new Set(priv.map(p=>p.instituto)).size,series};};
const report={new_this_run:rows.filter(p=>!initialIds.has(p.estudio_id)).length,period:['2023-07-23',asOf],entries:entries.size,added:audit.filter(a=>a.decision==='alta').length,crosschecked:audit.filter(a=>a.decision==='cruzada').length,quarantine:quarantine.length,before:stats(before),after:stats(output)};await save('intento-report.json',report);
if(!blocked()){await promoverLote(dir,{'manifest.json':manifest,'quarantine.json':quarantine,'audit.json':audit,'report.json':report,'before.json':before,'radar.json':output});}else issue('no_evaluable','RADAR_NO_PROMOVIDO','Lote bloqueado: radar anterior conservado');
console.log(JSON.stringify(report,null,2));

}catch(e){issue('error','ESTRUCTURA_INVALIDA',e.message);}finally{
const informe={etapa:'importacion-electografica',validado:!blocked(),incidencias,cobertura,fuentes};
await save('diagnostico.json',informe);
await writeFile(new URL('../integracion-validacion.json',dir),JSON.stringify(informe,null,2)+'\n');
if(blocked())process.exitCode=1;
}
