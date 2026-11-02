import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {extraerEntrada} from './extraer-electografica.mjs';

const dir = new URL('../docs/evidencia-reconciliacion/', import.meta.url);
const decision = JSON.parse(readFileSync(new URL('sigma.json', dir), 'utf8'));
const normalizar = p => {
  const q = structuredClone(p);
  for (const key of ['blogger_published', 'blogger_updated']) {
    if (q?.ingestion?.[key]) q.ingestion[key] = new Date(q.ingestion[key]).toISOString();
  }
  return q;
};
export function esHistoricoSigma(p) {
  return isDeepStrictEqual(normalizar(p), normalizar(decision.historico));
}
// Lista cerrada de versiones completas: ni un ID ni una cifra bastan.
export function resolverSigma(historico, wikipedia, candidato) {
  if (!esHistoricoSigma(historico) ||
      !isDeepStrictEqual(normalizar(wikipedia), normalizar(decision.wikipedia)) ||
      !isDeepStrictEqual(normalizar(candidato), normalizar(decision.candidato))) return null;
  for (const e of decision.evidencias) {
    const raw = readFileSync(new URL(e.file, dir));
    if (createHash('sha256').update(raw).digest('hex') !== e.sha256) throw Error('Evidencia Sigma Dos modificada: ' + e.file);
  }
  return {id: decision.id, decision: decision.decision, motivo: decision.motivo,
    evidencias: structuredClone(decision.evidencias), historico: structuredClone(historico),
    wikipedia: structuredClone(wikipedia), candidato: structuredClone(candidato)};
}
export function comprobarReconciliacion(r) {
  if (!r) return false;
  if (r.regla === 'electografica-sobre-wikipedia-v1') {
    const expected = resolverElectografica(r.original_historico,r.wikipedia,r.candidato,r.entrada);
    return !!expected && isDeepStrictEqual(r,expected);
  }
  const expected = resolverSigma(r.historico, r.wikipedia, r.candidato);
  return !!expected && isDeepStrictEqual(r, expected);
}

const canon = s => String(s).normalize('NFD').replace(/[\u0300-\u036f.\s-]/g,'').toUpperCase();
const identityFields=['ambito','tipo','fecha_publicacion','trabajo_campo_inicio','trabajo_campo_fin','tamano_muestra'];
function mismaIdentidad(a,b) {
  return a && b && canon(a.instituto)===canon(b.instituto) &&
    identityFields.every(k=>a[k]!=null && a[k]===b[k]) && Number.isInteger(a.tamano_muestra) && a.tamano_muestra>0;
}
// No lista de institutos ni de cifras: se vuelve a extraer el contenido íntegro.
// El llamador exige además una sola coincidencia en todo el lote.
export function resolverElectografica(h,w,p,entrada) {
  try {
    if(!mismaIdentidad(w,p) || w.ingestion?.source!=='wikipedia' ||
      !/^[a-f0-9]{64}$/.test(w.ingestion.sha256) || !w.ingestion.revision ||
      !['electografica.com','www.electografica.com'].includes(new URL(p.url_electografica).hostname)) return null;
    const extracted=extraerEntrada(entrada,p.fecha_publicacion);
    if(!isDeepStrictEqual(normalizar(extracted),normalizar(p))) return null;
    // Enlaces distintos necesitan un puente documental explícito, nunca fechas solas.
    const puente=w.fuente!==p.fuente ? resolverSigma(h,w,p) : null;
    if(w.fuente!==p.fuente && !puente) return null;
    if(h && (!mismaIdentidad(h,p) || h.estudio_id!==p.estudio_id ||
      h.ingestion?.entry_id!==p.ingestion.entry_id || h.url_electografica!==p.url_electografica ||
      (h.fuente!==p.fuente && !puente) ||
      Object.entries(h.resultados).some(([k,v])=>!Object.hasOwn(p.resultados,k)||p.resultados[k]!==v))) return null;
    // No se pierden valores de otras candidaturas ni referencias históricas.
    if(h && Object.entries(w.resultados).some(([k,v])=>!Object.hasOwn(p.resultados,k)&&h.resultados[k]!==v)) return null;
    const canonical=h ? structuredClone(h) : {...structuredClone(p),resultados:{...w.resultados,...p.resultados}};
    const diferencias=Object.keys({...w.resultados,...p.resultados}).sort().filter(k=>
      Object.hasOwn(w.resultados,k)!==Object.hasOwn(p.resultados,k)||w.resultados[k]!==p.resultados[k]).map(k=>({
      partido:k,wikipedia:Object.hasOwn(w.resultados,k)?{presente:true,valor:w.resultados[k]}:{presente:false},
      electografica:Object.hasOwn(p.resultados,k)?{presente:true,valor:p.resultados[k]}:{presente:false}
    }));
    if(!diferencias.length) return null;
    return {regla:'electografica-sobre-wikipedia-v1',id:'electografica-sobre-wikipedia-v1:'+p.ingestion.entry_id,
      decision:'conservar-electografica-documentar-diferencias',
      motivo:'Identidad corroborada por instituto, ámbito, tipo, publicación, campo completo, muestra y enlace original; prima Electográfica íntegra sobre Wikipedia. Valores ausentes no equivalen a cero. Histórico conservado.',
      identidad:Object.fromEntries(['instituto',...identityFields].map(k=>[k,p[k]])),
      diferencias,original_historico:structuredClone(h),historico:canonical,wikipedia:structuredClone(w),
      candidato:structuredClone(p),entrada:structuredClone(entrada),puente_documental:puente};
  } catch {return null;}
}
export function comprobarCuarentena(c, wikipedia, historico) {
  const r=c?.reconciliacion;
  return comprobarReconciliacion(r) && isDeepStrictEqual(wikipedia,r.wikipedia) &&
    isDeepStrictEqual(historico,r.historico) && isDeepStrictEqual(c.candidate,r.candidato) &&
    isDeepStrictEqual(c.extracted,r.candidato) && c.id===r.candidato.ingestion.entry_id &&
    c.url===r.candidato.url_electografica && isDeepStrictEqual(c.matches,[r.wikipedia]);
}
