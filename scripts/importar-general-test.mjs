import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {validate, deduplicate, update} from './update.mjs';
const {normalizeInstitute} = createRequire(import.meta.url)('../js/radar-core.js');
const digest = raw => createHash('sha256').update(raw).digest('hex');
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const fields = ['instituto','estudio_id','tipo','ambito','fecha_publicacion',
  'trabajo_campo_inicio','trabajo_campo_fin','tamano_muestra','resultados','fuente'];
function https(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password) throw Error('URL HTTPS requerida');
  return u;
}
export function authorize(source, today) {
  if (!source || !/^[a-z0-9-]+$/.test(source.id) || source.adapter !== 'normalized-json-v1'
    || !source.enabled || source.rights?.redistribution !== true
    || typeof source.rights.reviewedBy !== 'string' || !source.rights.reviewedBy.trim()
    || !date(source.rights.reviewedAt) || source.rights.reviewedAt > today
    || !Array.isArray(source.allowedHosts) || !source.allowedHosts.includes(https(source.url).hostname))
    throw Error('Fuente sin autorización o adaptador admitido');
  https(source.rights.evidenceUrl);
}
// No se infieren fichas técnicas ni identidades a partir del título de una noticia.
export function prepare(raw, source, today) {
  authorize(source,today);
  const payload = JSON.parse(raw);
  if (payload.version !== 1 || !Array.isArray(payload.encuestas) || !payload.encuestas.length)
    throw Error('Fuente vacía o formato no admitido');
  const report = {received:payload.encuestas.length, accepted:0, duplicates:0,
    excluded:[], quarantine:[], missing:{}, requestedSince:'2023-07-01',
    validatorSince:'2023-07-23', coverageComplete:false};
  const candidates = [];
  for (const [index, original] of payload.encuestas.entries()) {
    const missing = fields.filter(k => original?.[k] === undefined || original?.[k] === null || original?.[k] === '');
    for (const key of missing) report.missing[key] = (report.missing[key] ?? 0)+1;
    try {
      if (missing.length) throw Error('Faltan campos: '+missing.join(', '));
      if (normalizeInstitute(original.instituto) === 'CIS') {
        report.excluded.push({index,reason:'CIS: importador privado'}); continue;
      }
      if (date(original.fecha_publicacion) && original.fecha_publicacion < '2023-07-01') {
        report.excluded.push({index,reason:'Anterior a julio de 2023'}); continue;
      }
      const row = validate(original,source,today);
      candidates.push({...row,ingestion:{url:source.url,sha256:digest(raw),
        originalUrl:original.fuente,rights:source.rights,rawIndex:index}});
    } catch (error) { report.quarantine.push({index,reason:error.message}); }
  }
  // Conflictos de identidad abortan el lote; no escoger una revisión silenciosa.
  const encuestas = deduplicate(candidates);
  report.duplicates = candidates.length-encuestas.length;
  // Mismo instituto/campo con distinto ID: posible sindicación; revisión manual.
  const seen = new Map();
  for (const row of encuestas) {
    const key = [row.instituto.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase(),
      row.trabajo_campo_inicio,row.trabajo_campo_fin,row.ambito,row.tipo].join('|');
    if (seen.has(key)) throw Error('Posible duplicado con distinto estudio_id: '+key);
    seen.set(key,row.estudio_id);
  }
  report.accepted = encuestas.length;
  report.firstFieldEnd = encuestas.map(p=>p.trabajo_campo_fin).sort()[0] ?? null;
  report.lastFieldEnd = encuestas.map(p=>p.trabajo_campo_fin).sort().at(-1) ?? null;
  return {encuestas,report};
}
// Ruta fija bajo pipeline-test; nunca escribe el radar público ni prepara publicación.
export async function ingest(source, {base=new URL('../',import.meta.url), fetcher=fetch,
  now=new Date()}={}) {
  const today = now.toISOString().slice(0,10);
  authorize(source,today); // Antes de cualquier petición o escritura.
  const response = await fetcher(source.url,{redirect:'error',signal:AbortSignal.timeout(30000),
    headers:{'User-Agent':'AtlasElectoral-ingestion-test/0.1'}});
  if (!response.ok) throw Error('HTTP '+response.status);
  const chunks=[]; let size=0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if(size>5_000_000) throw Error('Fuente demasiado grande');
    chunks.push(Buffer.from(chunk));
  }
  const bytes=Buffer.concat(chunks), raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes), sha256=digest(bytes);
  const root = new URL('data/pipeline-test/general/',base);
  const archive = new URL('archive/',root);
  await mkdir(archive,{recursive:true});
  async function immutable(url,content) {
    try { await writeFile(url,content,{flag:'wx'}); }
    catch(error) { if(error.code!=='EEXIST' || !Buffer.from(await readFile(url)).equals(Buffer.from(content))) throw error; }
  }
  await immutable(new URL(sha256+'.raw',archive),bytes);
  await immutable(new URL(sha256+'.'+source.id+'.source.json',archive),JSON.stringify(source,null,2)+'\n');
  const {encuestas,report} = prepare(raw,source,today);
  const manifest={sourceId:source.id,url:source.url,sha256,retrievedAt:now.toISOString(),
    rights:source.rights,...report,publication:false};
  const run = new URL('runs/'+source.id+'-'+sha256+'-'+randomUUID()+'/',root);
  await mkdir(run,{recursive:true});
  // Informe conserva registros en cuarentena mediante índices al original archivado.
  await writeFile(new URL('report.json',run),JSON.stringify(manifest,null,2)+'\n');
  if (!encuestas.length || report.quarantine.length) return {...manifest,state:'review-required'};
  await mkdir(new URL('data/',root),{recursive:true});
  try { await writeFile(new URL('data/radar.json',root),JSON.stringify({version:1,encuestas:[],status:{}}),{flag:'wx'}); }
  catch(error) { if(error.code!=='EEXIST') throw error; }
  const previous=JSON.parse(await readFile(new URL('data/radar.json',root),'utf8'));
  // También controla sindicación entre ejecuciones, sin fusionar por proximidad.
  const combined=deduplicate([...previous.encuestas,...encuestas]);
  const identity=new Map();
  for(const row of combined) {
    const key=JSON.stringify([row.instituto.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase(),row.trabajo_campo_inicio,row.trabajo_campo_fin,row.ambito,row.tipo]);
    if(identity.has(key)) throw Error('Posible duplicado entre ejecuciones: '+key);
    identity.set(key,row.estudio_id);
  }
  await writeFile(new URL('data/sources.json',root),JSON.stringify({sources:[source]}));
  // Reutiliza sin cambios la validación, el merge append-only y la escritura atómica.
  const normalized=JSON.stringify({version:1,encuestas});
  await update(root,async()=>({ok:true,text:async()=>normalized}),now);
  return {...manifest,state:'staged'};
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  if (!process.argv.includes('--pipeline-test') || !process.argv.includes('--source')) {
    console.error('Uso: node scripts/importar-general-test.mjs --pipeline-test --source manifest.json');
    process.exitCode=1;
  } else {
    try {
      const file=process.argv[process.argv.indexOf('--source')+1];
      const result=await ingest(JSON.parse(await readFile(resolve(file),'utf8')));
      console.log(JSON.stringify(result,null,2));
      if(result.state!=='staged') process.exitCode=2;
    } catch(error) { console.error(error.message); process.exitCode=1; }
  }
}
