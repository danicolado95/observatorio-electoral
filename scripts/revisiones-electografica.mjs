import {isDeepStrictEqual} from 'node:util';
import {comprobarCuarentena} from './reconciliaciones-documentadas.mjs';

const identity = ['instituto', 'ambito', 'tipo', 'fecha_publicacion', 'trabajo_campo_inicio', 'trabajo_campo_fin', 'tamano_muestra'];

function sameEntry(prior, candidate) {
  return prior?.ingestion?.source === 'electografica' &&
    prior.estudio_id === candidate.estudio_id &&
    prior.url_electografica === candidate.url_electografica &&
    prior.ingestion.entry_id === candidate.ingestion.entry_id &&
    /^[a-f0-9]{64}$/.test(prior.ingestion.content_sha256) &&
    prior.ingestion.content_sha256 !== candidate.ingestion.content_sha256 &&
    Date.parse(prior.ingestion.blogger_published) === Date.parse(candidate.ingestion.blogger_published) &&
    Date.parse(prior.ingestion.blogger_updated) < Date.parse(candidate.ingestion.blogger_updated) &&
    prior.tamano_muestra > 0 && identity.every(key => prior[key] != null && prior[key] === candidate[key]);
}

export function conservarRevision(candidate, matches, previous, previousAudit, previousQuarantine) {
  if (matches.length !== 1 || !previous) return null;
  const [wiki] = matches;
  const crossed = previousAudit.filter(a => a.decision === 'cruzada' &&
    a.id === candidate.ingestion.entry_id && a.estudio_id === wiki.estudio_id);
  const reconciled = previousQuarantine.filter(a => a.id === candidate.ingestion.entry_id &&
    a.reconciliacion?.wikipedia?.estudio_id === wiki.estudio_id);
  if (crossed.length + reconciled.length !== 1) return null;
  if (crossed.length) {
    const [proof] = crossed;
    const prior = proof.extracted;
    const canonical = previous.encuestas.find(q => q.estudio_id === wiki.estudio_id);
    const reference = {source:'electografica', url:prior?.url_electografica, original:prior?.fuente,
      medio:prior?.medio, sha256:prior?.ingestion?.content_sha256};
    if (!sameEntry(prior,candidate) || !canonical || proof.url !== prior.url_electografica ||
        !canonical.fuentes_adicionales?.some(ref => isDeepStrictEqual(ref,reference)) ||
        identity.some(key => canonical[key] !== prior[key] || wiki[key] !== canonical[key]) ||
        wiki.fuente !== canonical.fuente || prior.fuente !== canonical.fuente ||
        !Object.keys(prior.resultados).length ||
        Object.entries(prior.resultados).some(([key,value]) => canonical.resultados[key] !== value) ||
        !isDeepStrictEqual(wiki,canonical)) return null;
    return {canonical, audit:proof};
  }
  const [proof] = reconciled;
  const canonical = previous.encuestas.find(q => q.estudio_id === proof.reconciliacion.historico.estudio_id);
  if (!sameEntry(proof.candidate,candidate) || !comprobarCuarentena(proof,wiki,canonical)) return null;
  return {canonical, quarantine:proof};
}
