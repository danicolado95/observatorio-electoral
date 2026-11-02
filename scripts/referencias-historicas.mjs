import {isDeepStrictEqual} from 'node:util';

// Una URL puede tener varias revisiones auditadas: conservar también su hash.
export function unirReferencias(...listas) {
  const refs = [];
  for (const ref of listas.flat()) {
    if (!refs.some(r => isDeepStrictEqual(r, ref))) refs.push(structuredClone(ref));
  }
  return refs;
}

// Audita todo el lote antes de modificarlo: un conflicto bloquea la recuperación.
export function conservarReferencias(rows, historico) {
  const incidencias = [], ids = new Map(), duplicados = new Set(), cambios = [];
  const registrar = (p, campo, codigo, esperado, observado, evidencia) => incidencias.push({
    etapa: 'referencias', fuente: 'historico', estudio_id: p.estudio_id, campo, codigo,
    esperado: esperado ?? null, observado: observado ?? null, evidencia, severidad: 'critica'
  });
  for (const p of rows) {
    if (ids.has(p.estudio_id)) {
      duplicados.add(p.estudio_id);
      registrar(p, 'estudio_id', 'ID_DUPLICADO', 'único', p.estudio_id, 'Identidad duplicada: ' + p.estudio_id);
    }
    ids.set(p.estudio_id, p);
  }
  const vistos = new Set();
  for (const p of historico) {
    if (vistos.has(p.estudio_id)) {
      registrar(p, 'estudio_id', 'ID_HISTORICO_DUPLICADO', 'único', p.estudio_id, 'Identidad histórica duplicada: ' + p.estudio_id);
      continue;
    }
    vistos.add(p.estudio_id);
    if (!p.fuentes_adicionales?.length) continue;
    const q = ids.get(p.estudio_id);
    if (!q || duplicados.has(p.estudio_id)) {
      registrar(p, 'fuentes_adicionales', 'DEPENDENCIA_NO_EVALUABLE', p.fuentes_adicionales, null,
        'Falta estudio único con referencias históricas: ' + p.estudio_id);
      continue;
    }
    const inicio = incidencias.length;
    for (const campo of ['instituto', 'ambito', 'tipo', 'trabajo_campo_inicio', 'trabajo_campo_fin', 'fecha_publicacion', 'tamano_muestra', 'fuente']) {
      if (!isDeepStrictEqual(p[campo], q[campo])) registrar(p, campo, 'CONFLICTO_REFERENCIA', p[campo], q[campo], 'Conflicto de referencia histórica: ' + p.estudio_id + '.' + campo);
    }
    for (const [partido, valor] of Object.entries(p.resultados)) {
      if (!q.resultados || !Object.hasOwn(q.resultados, partido) || q.resultados[partido] !== valor) {
        registrar(p, 'resultados.' + partido, 'CONFLICTO_REFERENCIA', valor, q.resultados?.[partido], 'Conflicto de referencia histórica: ' + p.estudio_id + '.resultados.' + partido);
      }
    }
    if (incidencias.length === inicio) cambios.push([q, unirReferencias(p.fuentes_adicionales, q.fuentes_adicionales || [])]);
  }
  if (incidencias.length) {
    const error = new AggregateError(incidencias.map(i => Error(i.evidencia)), incidencias.map(i => i.evidencia).join('\n'));
    error.informe = {validado: false, incidencias};
    throw error;
  }
  for (const [q, referencias] of cambios) q.fuentes_adicionales = referencias;
}
