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
const previous=await leer('data/pipeline-test/electografica/radar.json',null,true);
// Una salida previa solo puede enriquecer Wikipedia con su auditoría cruzada intacta.
let previousAudit=[];
if(previous)previousAudit=await leer('data/pipeline-test/electografica/audit.json',[],true);
for(const poll of previous?.encuestas||[]){try{const existing=base.encuestas.find(p=>p.estudio_id===poll.estudio_id);if(!existing)base.encuestas.push(poll);else{const start=incidencias.length;for(const k of ['instituto','fecha_publicacion','trabajo_campo_inicio','trabajo_campo_fin','tamano_muestra'])if(JSON.stringify(existing[k])!==JSON.stringify(poll[k]))issue('error','RECONCILIACION_PREVIA','Conflicto entre históricos: '+poll.estudio_id+'.'+k,poll.estudio_id);for(const [k,v] of Object.entries(poll.resultados))if(Object.hasOwn(existing.resultados,k)&&existing.resultados[k]!==v)issue('error','RECONCILIACION_PREVIA','Conflicto entre históricos: '+poll.estudio_id+'.resultados.'+k,poll.estudio_id);if(incidencias.length!==start)continue;const extras=Object.keys(poll.resultados).filter(k=>!Object.hasOwn(existing.resultados,k));if(extras.length){const proofs=previousAudit.filter(a=>a.decision==='cruzada'&&a.estudio_id===poll.estudio_id);if(proofs.length!==1)throw Error('Enriquecimiento previo sin auditoría única: '+poll.estudio_id);const a=proofs[0],e=a.extracted;if(!e||e.ingestion?.source!=='electografica'||a.id!==e.ingestion.entry_id||a.url!==e.url_electografica||!e.ingestion.content_sha256||!poll.fuentes_adicionales?.some(r=>r.source==='electografica'&&r.url===a.url&&r.sha256===e.ingestion.content_sha256&&r.original===e.fuente&&r.medio===e.medio)||['instituto','trabajo_campo_inicio','trabajo_campo_fin','fecha_publicacion','fuente','tamano_muestra'].some(k=>existing[k]!==e[k])||Object.entries(e.resultados).some(([k,v])=>poll.resultados[k]!==v)||extras.some(k=>!Object.hasOwn(e.resultados,k)))throw Error('Origen previo no comprobable: '+poll.estudio_id);}existing.resultados={...poll.resultados,...existing.resultados};if(poll.fuentes_adicionales?.length){existing.fuentes_adicionales=unirReferencias(poll.fuentes_adicionales,existing.fuentes_adicionales||[]);}}}
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
const snapshot=await leer('data/pipeline-test/electografica/snapshot.json',null);
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
 const title=e.title.$t,html=e.content?.$t||'',plain=text(html),url=e.link.find(l=>l.rel==='alternate')?.href;
 Object.assign(record,{title,url});
  if(!/ESPAÑA/.test(title))throw Error('Ámbito regional');
  if(/CIS|reestim|modelo|proyecci[oó]n/i.test(title))throw Error('CIS/modelo: se conserva canal CIS existente');
  const m=title.match(/Encuesta (.*?) (\d{2})\/(\d{2})\/(20\d{2})/);if(!m)throw Error('Identidad no reconocida');
  const pub=iso(m[2],m[3],m[4]);if(pub<'2023-07-23'||pub>asOf)throw Error('Fuera del periodo');
  let institute=alias[m[1]]||m[1];
  const ft=plain.match(/(?:Periodo de campo:|Fecha realización)\s*(.*?)(?:·|Método)/i);const dates=ft&&field(ft[1]);if(!dates)problemas.push({codigo:'CAMPO_INCOMPLETO',evidencia:'Campo incompleto: no se imputa'});
  const source=html.match(/Fuente:\s*(?:<[^>]*>\s*)*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);if(!source)problemas.push({codigo:'ORIGINAL_AUSENTE',evidencia:'Falta enlace original'});
  const results={};
  const segment=html.split(/<!--\s*(?:ESCAÑOS|EVOLUCIÓN|IDV|INTENCIÓN DIRECTA)/i)[0];
  for(const c of segment.matchAll(/<!--\s*([^<>]+?)\s*-->([\s\S]*?)(?=<!--|$)/g)){
   const key=party(c[1].trim());if(!['PP','PSOE','VOX','SUMAR','PODEMOS','ERC','JUNTS','EH_BILDU','PNV','BNG','CC','UPN','PACMA','SALF','ALIANCA_CAT','ADELANTE_ANDALUCIA','FA','FV'].includes(key))continue;
   const v=c[2].match(/class="dato_encuesta"[^>]*>\s*(\d+(?:[,.]\d+)?)/)||c[2].match(/class="bar-fill-anim"\s+data-w="(\d+(?:\.\d+)?)/);
   if(v)results[key]=Number(v[1].replace(',','.'));
  }
  if(!['PP','PSOE','VOX'].every(k=>Number.isFinite(results[k])))problemas.push({codigo:'PORCENTAJES_INCOMPLETOS',evidencia:'Formato de porcentajes no reconocido'});
  if(Object.values(results).some(v=>v<0||v>100)||Object.values(results).reduce((a,b)=>a+b,0)>100.5)problemas.push({codigo:'PORCENTAJES_INVALIDOS',evidencia:'Porcentajes fuera de rango o suma inválida'});
  if(problemas.length)throw Error(problemas.map(p=>p.evidencia).join('; '));
  const sample=plain.match(/Muestra:?\s*([\d.]+)(?:\s|·)/);
  const p=validate({instituto:institute,estudio_id:'electografica-'+hash(e.id.$t).slice(0,20),tipo:'estimacion_voto',ambito:'España',fecha_publicacion:pub,trabajo_campo_inicio:dates[0],trabajo_campo_fin:dates[1],fecha_fin_campo:dates[1],tipo_fecha:'publicacion',tamano_muestra:sample?Number(sample[1].replaceAll('.','')):null,resultados:results,fuente:source[1].replaceAll('&amp;','&'),medio:text(source[2]),url_electografica:url,ingestion:{source:'electografica',entry_id:e.id.$t,content_sha256:hash(html),blogger_published:e.published.$t,blogger_updated:e.updated.$t}}, {id:'electografica',allowHistoricalMetadata:true,allowedHosts:[new URL(source[1]).hostname]},asOf);
  record.extracted=p;candidate=p;const matches=rows.filter(q=>canon(q.instituto)===canon(p.instituto)&&(q.trabajo_campo_fin===p.trabajo_campo_fin||q.fecha_publicacion===p.fecha_publicacion||(q.fuente===p.fuente&&Math.abs(Date.parse(q.trabajo_campo_fin)-Date.parse(p.trabajo_campo_fin))<=7*86400000)));
  if(matches.length){
   const exact=matches.length===1&&matches[0].trabajo_campo_fin===p.trabajo_campo_fin&&Object.keys(p.resultados).every(k=>!Object.hasOwn(matches[0].resultados,k)||matches[0].resultados[k]===p.resultados[k])?matches[0]:null;
   if(!exact)throw Error('Conflicto con registro existente: '+matches.map(q=>q.estudio_id).join(','));
   if(exact.fecha_publicacion!==p.fecha_publicacion)throw Error('Discrepancia de publicación: '+exact.estudio_id);
   if(exact.url_electografica===url){audit.push({...record,decision:'alta',estudio_id:exact.estudio_id});continue;}
   if(Object.keys(p.resultados).some(k=>!Object.hasOwn(exact.resultados,k))&&['instituto','trabajo_campo_inicio','trabajo_campo_fin','fecha_publicacion','fuente','tamano_muestra'].some(k=>exact[k]!==p[k]))throw Error('Identidad no homologada para enriquecimiento');
   const referencias=unirReferencias(exact.fuentes_adicionales||[],[{source:'electografica',url,original:p.fuente,medio:p.medio,sha256:p.ingestion.content_sha256}]);
   exact.resultados={...exact.resultados,...p.resultados};
   exact.fuentes_adicionales=referencias;audit.push({...record,decision:'cruzada',estudio_id:exact.estudio_id});
  }else{rows.push(p);audit.push({...record,decision:'alta',estudio_id:p.estudio_id});}
 }catch(error){const tipo=/^(Ámbito regional|CIS\/modelo|Fuera del periodo)/.test(error.message)?'exclusion_esperada':'cuarentena';if(problemas.length)for(const p of problemas)issue(tipo,p.codigo,p.evidencia,record.id);else issue(tipo,tipo==='cuarentena'?'CANDIDATO_RECHAZADO':'FUERA_DE_ALCANCE',error.message,record.id);quarantine.push({...record,reason:error.message,candidate,matches:candidate?rows.filter(q=>canon(q.instituto)===canon(candidate.instituto)&&(q.trabajo_campo_fin===candidate.trabajo_campo_fin||q.fecha_publicacion===candidate.fecha_publicacion||q.fuente===candidate.fuente)).map(q=>({estudio_id:q.estudio_id,trabajo_campo_inicio:q.trabajo_campo_inicio,trabajo_campo_fin:q.trabajo_campo_fin,fecha_publicacion:q.fecha_publicacion,resultados:q.resultados,fuente:q.fuente})):[]});}
}
const output={...base,encuestas:rows,status:{...base.status,message:'Histórico local Wikipedia + Electográfica; conflictos en cuarentena.'}};
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
