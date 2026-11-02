import {conservarReferencias, unirReferencias} from './referencias-historicas.mjs';
import {readFile,writeFile,readdir,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {parseArgs} from 'node:util';
import {validate} from './update.mjs';
const {values}=parseArgs({options:{'as-of':{type:'string'}}});
const asOf=values['as-of']??new Date().toISOString().slice(0,10);
if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!Number.isFinite(Date.parse(asOf))||new Date(asOf).toISOString().slice(0,10)!==asOf)throw Error('AsOf inválido: use YYYY-MM-DD');
const core=createRequire(import.meta.url)('../js/radar-core.js');
const root=process.env.ELECTOGRAFICA_TEST_ROOT?new URL('file:///'+process.env.ELECTOGRAFICA_TEST_ROOT.replaceAll('\\','/')+'/'):new URL('../',import.meta.url),dir=new URL('data/pipeline-test/electografica/',root);
const read=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const save=async(n,v)=>{const target=new URL(n,dir),tmp=new URL(n+'.tmp',dir);await writeFile(tmp,JSON.stringify(v,null,2)+'\n');await rename(tmp,target);};
const hash=s=>createHash('sha256').update(s).digest('hex');
const text=s=>s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]*>/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&nbsp;/g,' ').replace(/&middot;/g,'·').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const iso=(d,m,y)=>`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
function field(s){let m=s.match(/(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?[-–](\d{1,2})\/(\d{1,2})\/(20\d{2})/);if(m)return [iso(m[1],m[2],m[3]||m[6]),iso(m[4],m[5],m[6])];m=s.match(/(\d{1,2})(?:[-–](\d{1,2}))?\/(\d{1,2})\/(20\d{2})/);if(m)return [iso(m[1],m[3],m[4]),iso(m[2]||m[1],m[3],m[4])];return null;}
const alias={'40dB.':'40dB','SigmaDos':'Sigma Dos','IMOP Insights':'IMOP','NC-Report':'NC Report','Celeste Tel':'Celeste-Tel','ElectoPanel':'EM-Analytics'};
const canon=s=>(alias[s]||s).normalize('NFD').replace(/[\u0300-\u036f.\s-]/g,'').toUpperCase();
const party=s=>({'SE ACABÓ':'SALF','EH BILDU':'EH_BILDU','EAJ-PNV':'PNV','CCa':'CC','NA+/UPN':'UPN','ALIANÇA.CAT':'ALIANCA_CAT','ADELANTE ANDALUCÍA':'ADELANTE_ANDALUCIA'})[s]||s;
await mkdir(dir,{recursive:true});
const base=await read('data/pipeline-test/wikipedia/radar.json');
let previous;try{previous=await read('data/pipeline-test/electografica/radar.json');}catch(e){if(e.code!=='ENOENT')throw e;}
// Una salida previa solo puede enriquecer Wikipedia con su auditoría cruzada intacta.
let previousAudit=[];
if(previous)try{previousAudit=await read('data/pipeline-test/electografica/audit.json');}catch(e){if(e.code!=='ENOENT')throw e;}
for(const poll of previous?.encuestas||[]){const existing=base.encuestas.find(p=>p.estudio_id===poll.estudio_id);if(!existing)base.encuestas.push(poll);else{if(['instituto','fecha_publicacion','trabajo_campo_inicio','trabajo_campo_fin','tamano_muestra'].some(k=>JSON.stringify(existing[k])!==JSON.stringify(poll[k])))throw Error('Conflicto entre históricos: '+poll.estudio_id);if(Object.entries(poll.resultados).some(([k,v])=>Object.hasOwn(existing.resultados,k)&&existing.resultados[k]!==v))throw Error('Conflicto entre históricos: '+poll.estudio_id);const extras=Object.keys(poll.resultados).filter(k=>!Object.hasOwn(existing.resultados,k));if(extras.length){const proofs=previousAudit.filter(a=>a.decision==='cruzada'&&a.estudio_id===poll.estudio_id);if(proofs.length!==1)throw Error('Enriquecimiento previo sin auditoría única: '+poll.estudio_id);const a=proofs[0],e=a.extracted;if(!e||e.ingestion?.source!=='electografica'||a.id!==e.ingestion.entry_id||a.url!==e.url_electografica||!e.ingestion.content_sha256||!poll.fuentes_adicionales?.some(r=>r.source==='electografica'&&r.url===a.url&&r.sha256===e.ingestion.content_sha256&&r.original===e.fuente&&r.medio===e.medio)||['instituto','trabajo_campo_inicio','trabajo_campo_fin','fecha_publicacion','fuente','tamano_muestra'].some(k=>existing[k]!==e[k])||Object.entries(e.resultados).some(([k,v])=>poll.resultados[k]!==v)||extras.some(k=>!Object.hasOwn(e.resultados,k)))throw Error('Origen previo no comprobable: '+poll.estudio_id);}existing.resultados={...poll.resultados,...existing.resultados};if(poll.fuentes_adicionales?.length){existing.fuentes_adicionales=unirReferencias(poll.fuentes_adicionales,existing.fuentes_adicionales||[]);}}}
// El histórico versionado conserva procedencia aunque una entrada ya no cruce.
let historico;
try{historico=await read('data/radar-desarrollo.json');}catch(e){if(e.code!=='ENOENT')throw e;}
if(historico)conservarReferencias(base.encuestas,historico.encuestas);
const initialIds=new Set(base.encuestas.map(p=>p.estudio_id));
let before;try{before=await read('data/pipeline-test/electografica/before.json');}catch{before=structuredClone(base);await save('before.json',before);}
const rows=structuredClone(base.encuestas),quarantine=[],audit=[],entries=new Map(),manifest=[];
let snapshot;try{snapshot=await read('data/pipeline-test/electografica/snapshot.json');}catch(e){if(e.code!=='ENOENT')throw e;}
if(snapshot){if(snapshot.complete!==true||!snapshot.expected||snapshot.feed?.entry?.length!==snapshot.expected||new Set(snapshot.feed.entry.map(e=>e.id.$t)).size!==snapshot.expected)throw Error('Snapshot incompleto o vacío: histórico conservado');for(const e of snapshot.feed.entry)entries.set(e.id.$t,e);manifest.push({file:'snapshot.json',sha256:hash(JSON.stringify(snapshot)),entries:entries.size});}
else throw Error('Falta snapshot completo: descargue primero; histórico conservado');
if(!entries.size)throw Error('Feed vacío: histórico conservado');
for(const e of entries.values()){
 const title=e.title.$t,html=e.content?.$t||'',plain=text(html),url=e.link.find(l=>l.rel==='alternate')?.href;
 const record={id:e.id.$t,title,url};let candidate;
 try{
  if(!/ESPAÑA/.test(title))throw Error('Ámbito regional');
  if(/CIS|reestim|modelo|proyecci[oó]n/i.test(title))throw Error('CIS/modelo: se conserva canal CIS existente');
  const m=title.match(/Encuesta (.*?) (\d{2})\/(\d{2})\/(20\d{2})/);if(!m)throw Error('Identidad no reconocida');
  const pub=iso(m[2],m[3],m[4]);if(pub<'2023-07-23'||pub>asOf)throw Error('Fuera del periodo');
  let institute=alias[m[1]]||m[1];
  const ft=plain.match(/(?:Periodo de campo:|Fecha realización)\s*(.*?)(?:·|Método)/i);const dates=ft&&field(ft[1]);if(!dates)throw Error('Campo incompleto: no se imputa');
  const source=html.match(/Fuente:\s*(?:<[^>]*>\s*)*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);if(!source)throw Error('Falta enlace original');
  const results={};
  const segment=html.split(/<!--\s*(?:ESCAÑOS|EVOLUCIÓN|IDV|INTENCIÓN DIRECTA)/i)[0];
  for(const c of segment.matchAll(/<!--\s*([^<>]+?)\s*-->([\s\S]*?)(?=<!--|$)/g)){
   const key=party(c[1].trim());if(!['PP','PSOE','VOX','SUMAR','PODEMOS','ERC','JUNTS','EH_BILDU','PNV','BNG','CC','UPN','PACMA','SALF','ALIANCA_CAT','ADELANTE_ANDALUCIA','FA','FV'].includes(key))continue;
   const v=c[2].match(/class="dato_encuesta"[^>]*>\s*(\d+(?:[,.]\d+)?)/)||c[2].match(/class="bar-fill-anim"\s+data-w="(\d+(?:\.\d+)?)/);
   if(v)results[key]=Number(v[1].replace(',','.'));
  }
  if(!['PP','PSOE','VOX'].every(k=>Number.isFinite(results[k])))throw Error('Formato de porcentajes no reconocido');
  const sample=plain.match(/Muestra:?\s*([\d.]+)(?:\s|·)/);
  const p=validate({instituto:institute,estudio_id:'electografica-'+hash(e.id.$t).slice(0,20),tipo:'estimacion_voto',ambito:'España',fecha_publicacion:pub,trabajo_campo_inicio:dates[0],trabajo_campo_fin:dates[1],fecha_fin_campo:dates[1],tipo_fecha:'publicacion',tamano_muestra:sample?Number(sample[1].replaceAll('.','')):null,resultados:results,fuente:source[1].replaceAll('&amp;','&'),medio:text(source[2]),url_electografica:url,ingestion:{source:'electografica',entry_id:e.id.$t,content_sha256:hash(html),blogger_published:e.published.$t,blogger_updated:e.updated.$t}}, {id:'electografica',allowHistoricalMetadata:true,allowedHosts:[new URL(source[1]).hostname]},asOf);
  record.extracted=p;candidate=p;const matches=rows.filter(q=>canon(q.instituto)===canon(p.instituto)&&(q.trabajo_campo_fin===p.trabajo_campo_fin||q.fecha_publicacion===p.fecha_publicacion||(q.fuente===p.fuente&&Math.abs(Date.parse(q.trabajo_campo_fin)-Date.parse(p.trabajo_campo_fin))<=7*86400000)));
  if(matches.length){
   const exact=matches.length===1&&matches[0].trabajo_campo_fin===p.trabajo_campo_fin&&Object.keys(p.resultados).every(k=>!Object.hasOwn(matches[0].resultados,k)||matches[0].resultados[k]===p.resultados[k])?matches[0]:null;
   if(!exact)throw Error('Conflicto con registro existente: '+matches.map(q=>q.estudio_id).join(','));
   if(exact.url_electografica===url){audit.push({...record,decision:'alta',estudio_id:exact.estudio_id});continue;}
   if(Object.keys(p.resultados).some(k=>!Object.hasOwn(exact.resultados,k))&&['instituto','trabajo_campo_inicio','trabajo_campo_fin','fecha_publicacion','fuente','tamano_muestra'].some(k=>exact[k]!==p[k]))throw Error('Identidad no homologada para enriquecimiento');
   exact.resultados={...exact.resultados,...p.resultados};
   exact.fuentes_adicionales=unirReferencias(exact.fuentes_adicionales||[],[{source:'electografica',url,original:p.fuente,medio:p.medio,sha256:p.ingestion.content_sha256}]);audit.push({...record,decision:'cruzada',estudio_id:exact.estudio_id});
  }else{rows.push(p);audit.push({...record,decision:'alta',estudio_id:p.estudio_id});}
 }catch(error){quarantine.push({...record,reason:error.message,candidate,matches:candidate?rows.filter(q=>canon(q.instituto)===canon(candidate.instituto)&&(q.trabajo_campo_fin===candidate.trabajo_campo_fin||q.fecha_publicacion===candidate.fecha_publicacion||q.fuente===candidate.fuente)).map(q=>({estudio_id:q.estudio_id,trabajo_campo_inicio:q.trabajo_campo_inicio,trabajo_campo_fin:q.trabajo_campo_fin,fecha_publicacion:q.fecha_publicacion,resultados:q.resultados,fuente:q.fuente})):[]});}
}
const output={...base,encuestas:rows,status:{...base.status,message:'Histórico local Wikipedia + Electográfica; conflictos en cuarentena.'}};
await save('manifest.json',manifest);await save('quarantine.json',quarantine);await save('audit.json',audit);await save('radar.json',output);
const stats=data=>{const priv=core.select(data.encuestas,false);const series={};for(const cis of [false,true])for(const party of ['PP','PSOE','VOX','SUMAR']){const points=new Map(core.medianTrend(core.select(data.encuestas,cis),party,asOf).map(p=>[p.date,p]));let valid=0,max=0,run=0;for(let t=Date.parse('2023-07-23');t<=Date.parse(asOf);t+=86400000){if(points.get(new Date(t).toISOString().slice(0,10))?.value!=null){valid++;run=0;}else{run++;max=Math.max(max,run);}}series[(cis?'ON_':'OFF_')+party]={valid_days:valid,max_gap_days:max};}return {private:priv.length,cis:data.encuestas.length-priv.length,institutes:new Set(priv.map(p=>p.instituto)).size,series};};
const report={new_this_run:rows.filter(p=>!initialIds.has(p.estudio_id)).length,period:['2023-07-23',asOf],entries:entries.size,added:audit.filter(a=>a.decision==='alta').length,crosschecked:audit.filter(a=>a.decision==='cruzada').length,quarantine:quarantine.length,before:stats(before),after:stats(output)};await save('report.json',report);console.log(JSON.stringify(report,null,2));
