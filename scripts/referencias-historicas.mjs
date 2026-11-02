import {isDeepStrictEqual} from 'node:util';

// Una URL puede tener varias revisiones auditadas: conservar también su hash.
export function unirReferencias(...listas) {
  const refs = [];
  for (const ref of listas.flat()) {
    if (!refs.some(r => isDeepStrictEqual(r, ref))) refs.push(structuredClone(ref));
  }
  return refs;
}

// Solo se recupera procedencia del mismo estudio, nunca porcentajes ni alias.
export function conservarReferencias(rows, historico) {
  const ids = new Map();
  for (const p of rows) {
    if (ids.has(p.estudio_id)) throw Error('Identidad duplicada: ' + p.estudio_id);
    ids.set(p.estudio_id, p);
  }
  const vistos = new Set();
  for (const p of historico) {
    if (vistos.has(p.estudio_id)) throw Error('Identidad histórica duplicada: ' + p.estudio_id);
    vistos.add(p.estudio_id);
    if (!p.fuentes_adicionales?.length) continue;
    const q = ids.get(p.estudio_id);
    if (!q) throw Error('Falta estudio con referencias históricas: ' + p.estudio_id);
    const fields = ['instituto', 'ambito', 'tipo', 'trabajo_campo_inicio', 'trabajo_campo_fin', 'fecha_publicacion', 'tamano_muestra', 'fuente'];
    if (fields.some(k => !isDeepStrictEqual(p[k], q[k])) ||
        Object.entries(p.resultados).some(([k,v]) => q.resultados[k] !== v)) {
      throw Error('Conflicto de referencia histórica: ' + p.estudio_id);
    }
    q.fuentes_adicionales = unirReferencias(p.fuentes_adicionales, q.fuentes_adicionales || []);
  }
}
