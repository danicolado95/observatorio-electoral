import {readFile, writeFile, rename, rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const hash = value => createHash('sha256').update(value).digest('hex');
const {normalizeInstitute} = createRequire(import.meta.url)('../js/radar-core.js');
const stable = x => JSON.stringify(x, Object.keys(x).sort());
const day = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s).toISOString().slice(0,10) === s;
const https = s => { const u = new URL(s); if(u.protocol !== 'https:' || u.username || u.password) throw Error('URL HTTPS requerida'); return u; };
export function validate(p, source, today) {
  const instituto = normalizeInstitute(p.instituto);
  if (typeof p.estudio_id !== 'string' || !p.estudio_id.trim() || p.tipo !== 'estimacion_voto' || p.ambito !== 'España') throw Error('Identidad, ámbito o tipo inválidos');
  for (const k of ['fecha_publicacion','trabajo_campo_inicio','trabajo_campo_fin']) if (!day(p[k])) throw Error('Fecha inválida');
  if (p.trabajo_campo_inicio > p.trabajo_campo_fin || p.trabajo_campo_fin > p.fecha_publicacion || p.fecha_publicacion > today || p.trabajo_campo_fin < '2023-07-23') throw Error('Orden temporal inválido');
  if (!Number.isInteger(p.tamano_muestra) || p.tamano_muestra <= 0) throw Error('Muestra inválida');
  if (!p.resultados || !Object.keys(p.resultados).length || Object.entries(p.resultados).some(([k,v]) => !/^[A-Z0-9_-]+$/.test(k) || !Number.isFinite(v) || v < 0 || v > 100) || Object.values(p.resultados).reduce((a,b)=>a+b,0)>100.5) throw Error('Porcentajes inválidos');
  if (!source.allowedHosts.includes(https(p.fuente).hostname)) throw Error('Fuente fuera de lista');
  return {...p, instituto, estudio_id:p.estudio_id.trim(), source_id:source.id};
}
export function deduplicate(polls) {
  const rows = new Map();
  for(const p of polls) {
    const key = [normalizeInstitute(p.instituto).toUpperCase(),p.estudio_id,p.ambito,p.tipo].join('|');
    const existing = rows.get(key);
    if(existing && stable(existing.resultados) !== stable(p.resultados)) throw Error('Revisión o duplicado contradictorio: '+key);
    if(existing && ['trabajo_campo_inicio','trabajo_campo_fin','tamano_muestra'].some(k=>existing[k]!==p[k])) throw Error('Metadatos contradictorios: '+key);
    if(!existing) rows.set(key,p);
  }
  return [...rows.values()].sort((a,b)=>a.fecha_publicacion.localeCompare(b.fecha_publicacion)||a.instituto.localeCompare(b.instituto)||a.estudio_id.localeCompare(b.estudio_id));
}
async function json(path) { return JSON.parse(await readFile(path,'utf8')); }
async function atomic(path, value, io) {
  const temporary = path+'.'+randomUUID()+'.tmp';
  try {
    await io.writeFile(temporary,JSON.stringify(value,null,2)+'\n');
    await io.rename(temporary,path);
  } finally {
    await rm(temporary,{force:true});
  }
}
export async function update(root = new URL('../',import.meta.url), fetcher = fetch, now = new Date(), io = {writeFile,rename}) {
  const path = s => new URL(s,root);
  // URL string permits adding a temporary suffix in atomic().
  const {fileURLToPath} = await import('node:url');
  const local = s => fileURLToPath(path(s));
  const registry = await json(local('data/sources.json'));
  const old = await json(local('data/radar.json'));
  // Legacy status is read only during migration. All subsequent reads and writes
  // use the single snapshot, including error/unconfigured states.
  const previous = old.status ?? await json(local('data/update-status.json'));
  const status = {...previous,lastAttempt:now.toISOString(),sources:[]};
  const commit = (encuestas, state) => atomic(local('data/radar.json'),{version:1,encuestas,status:state},io);
  let result;
  try {
    const active = registry.sources.filter(s=>s.enabled);
    if(!active.length) { result = {encuestas:old.encuestas,status:{...status,state:'unconfigured',message:'Sin fuentes autorizadas habilitadas; no se han buscado encuestas.'}}; }
    else {
    const polls = [];
    for(const s of active) {
      if(s.adapter !== 'normalized-json-v1' || !s.rights?.redistribution || !s.rights.reviewedBy || !day(s.rights.reviewedAt) || s.rights.reviewedAt > now.toISOString().slice(0,10)) throw Error('Fuente sin autorización documentada: '+s.id);
      https(s.rights.evidenceUrl);
      if(!s.allowedHosts.includes(https(s.url).hostname)) throw Error('Host no autorizado');
      const response = await fetcher(s.url,{redirect:'error',signal:AbortSignal.timeout(30000)});
      if(!response.ok) throw Error('HTTP '+response.status+' en '+s.id);
      const raw = await response.text();
      if(Buffer.byteLength(raw)>5_000_000) throw Error('Fuente demasiado grande');
      const payload = JSON.parse(raw);
      if(payload.version!==1 || !Array.isArray(payload.encuestas)) throw Error('Formato de fuente no admitido');
      if(!payload.encuestas.length) throw Error('Fuente vacía; revisión requerida: '+s.id);
      const digest = hash(raw);
      for(const poll of payload.encuestas) polls.push({...validate(poll,s,now.toISOString().slice(0,10)),provenance:{url:s.url,sha256:digest,rights:s.rights}});
      status.sources.push({id:s.id,url:s.url,sha256:digest,count:payload.encuestas.length,checkedAt:status.lastAttempt});
    }
    const institutosActualizados = new Set(
  polls.map(p => normalizeInstitute(p.instituto).toUpperCase())
);

const encuestasConservadas = old.encuestas.filter(
  encuesta =>
    !institutosActualizados.has(
      normalizeInstitute(encuesta.instituto).toUpperCase()
    )
);

const encuestas = deduplicate([
  ...encuestasConservadas,
  ...polls
]);
    const changed = JSON.stringify(old.encuestas)!==JSON.stringify(encuestas);
    result = {encuestas,status:{...status,state:'ok',lastSuccess:status.lastAttempt,lastDataChange:changed?status.lastAttempt:previous.lastDataChange,message:changed?'Datos actualizados':'Sin cambios en las fuentes habilitadas'}};
    }
  } catch(error) {
    await commit(old.encuestas,{...status,state:'error',message:error.message});
    throw error;
  }
  // A failed write/rename leaves the entire previous snapshot intact. Do not
  // attempt another status write after a persistence failure.
  await commit(result.encuestas,result.status);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) update().catch(e=>{console.error(e.message);process.exitCode=1;});
