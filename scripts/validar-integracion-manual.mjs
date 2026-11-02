import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const core = createRequire(import.meta.url)('../js/radar-core.js');

// Solo las fechas Blogger de la auditoría del alias admiten otra zona horaria.
function normalizarFechasAuditoria(ingestion, label) {
  const normalizada = {...ingestion};
  for (const key of ['blogger_published', 'blogger_updated']) {
    if (!Object.hasOwn(normalizada, key)) continue;
    const value = normalizada[key];
    const match = typeof value === 'string' && value.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);
    const instant = match ? Date.parse(value) : NaN;
    const calendar = match && new Date(0);
    if (match) calendar.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    assert(match && Number.isFinite(instant) &&
      calendar.getUTCFullYear() === Number(match[1]) &&
      calendar.getUTCMonth() === Number(match[2]) - 1 && calendar.getUTCDate() === Number(match[3]) &&
      Number(match[4]) < 24 && Number(match[5]) < 60 && Number(match[6]) < 60 &&
      (match[7] === 'Z' || (Number(match[7].slice(1, 3)) < 24 && Number(match[7].slice(4)) < 60)),
      label + ': fecha de auditoría inválida en ingestion.' + key);
    normalizada[key] = instant;
  }
  return normalizada;
}

// Solo una auditoría única puede autorizar el cambio de identidad.
function resolverAlias(p, ids, auditoria, label) {
  const matches = auditoria.filter(a => a.extracted?.estudio_id === p.estudio_id);
  assert.equal(matches.length, 1, label + ': alias sin auditoría única para ' + p.estudio_id);
  const a = matches[0], e = a.extracted, q = ids.get(a.estudio_id);
  assert(a.decision === 'cruzada' && q && q.estudio_id !== p.estudio_id,
    label + ': correspondencia de identidad inválida');
  for (const key of ['instituto', 'trabajo_campo_inicio', 'trabajo_campo_fin', 'fecha_publicacion', 'fuente', 'url_electografica']) {
    assert(typeof p[key] === 'string' && p[key].trim(), label + ': alias sin ' + key);
  }
  assert(p.resultados && Object.keys(p.resultados).length &&
    Object.values(p.resultados).every(Number.isFinite), label + ': alias sin resultados completos');
  assert(p.ingestion?.source === 'electografica' && p.source_id === 'electografica' &&
    p.ingestion.entry_id && p.ingestion.content_sha256 &&
    a.id === p.ingestion.entry_id && a.url === p.url_electografica,
    label + ': alias sin origen comprobable');
  for (const [key, value] of Object.entries(p)) {
    if (key === 'ingestion') {
      assert.deepEqual(normalizarFechasAuditoria(e[key], label), normalizarFechasAuditoria(value, label),
        label + ': auditoría distinta en ingestion');
    } else if (key !== 'fuentes_adicionales') assert.deepEqual(e[key], value, label + ': auditoría distinta en ' + key);
  }
  // La procedencia Electográfica pasa a una referencia del registro canónico.
  const ref = {source: 'electografica', url: p.url_electografica, original: p.fuente,
    medio: p.medio, sha256: p.ingestion.content_sha256};
  assert(q.fuentes_adicionales?.some(r => isDeepStrictEqual(r, ref)), label + ': origen del alias perdido');
  return q;
}

// No se comparan solo cantidades: cada registro previo debe conservar sus campos.
export function verificar({original, desarrollo, cis, wikipedia, combinado, reporte, auditoria, cuarentena}) {
  const rows = combinado.encuestas;
  assert(Array.isArray(rows) && rows.length, 'Radar combinado vacío');
  const ids = new Map(rows.map(p => [p.estudio_id, p]));
  assert.equal(ids.size, rows.length, 'Identidades duplicadas');
  const conservar = (polls, label) => {
    for (const p of polls) {
      const mismoId = ids.has(p.estudio_id);
      const q = mismoId ? ids.get(p.estudio_id) : resolverAlias(p, ids, auditoria, label);
      assert(q, `${label}: falta ${p.estudio_id}`);
      for (const [key, value] of Object.entries(p)) {
        // Electográfica puede añadir referencias, pero no quitar las existentes.
        if (!mismoId && ['estudio_id', 'ingestion', 'source_id', 'url_electografica', 'medio'].includes(key)) continue;
        if (key === 'fuentes_adicionales') {
          for (const ref of value) assert(q[key]?.some(r => isDeepStrictEqual(r, ref)), `${label}: referencia perdida`);
         } else if (key === 'resultados' && !isDeepStrictEqual(q[key], value)) {
          // Ausencia no equivale a cero; todo valor previo debe conservarse.
          for (const [party, percent] of Object.entries(value)) {
            assert(Object.hasOwn(q.resultados, party) && q.resultados[party] === percent,
              label + ': cambió resultados.' + party);
          }
          const proofs = auditoria.filter(a => a.decision === 'cruzada' && a.estudio_id === q.estudio_id && a.extracted?.estudio_id !== q.estudio_id);
          assert.equal(proofs.length, 1, label + ': enriquecimiento sin auditoría única');
          const e = proofs[0].extracted;
          assert.equal(resolverAlias(e, ids, auditoria, label), q);
          for (const field of ['instituto', 'trabajo_campo_inicio', 'trabajo_campo_fin', 'fecha_publicacion', 'fuente', 'tamano_muestra']) {
            assert.deepEqual(q[field], e[field], label + ': identidad no homologada en ' + field);
          }
          for (const [party, percent] of Object.entries(e.resultados)) {
            assert(Object.hasOwn(q.resultados, party) && q.resultados[party] === percent, label + ': conflicto auditado en ' + party);
          }
          for (const party of Object.keys(q.resultados)) {
            const bases = wikipedia.encuestas.filter(w => w.estudio_id === q.estudio_id);
            const fromWiki = bases.length === 1 && Object.hasOwn(bases[0].resultados, party) && bases[0].resultados[party] === q.resultados[party];
            assert(Object.hasOwn(value, party) || Object.hasOwn(e.resultados, party) || fromWiki, label + ': extra sin origen en ' + party);
          }
        } else assert.deepEqual(q[key], value, `${label}: cambió ${p.estudio_id}.${key}`);
      }
    }
  };
  conservar(original.encuestas, 'Radar versionado');
  conservar(desarrollo.encuestas, 'Histórico de desarrollo versionado');
  conservar(cis.encuestas, 'CIS histórico versionado');
  conservar(wikipedia.encuestas, 'Wikipedia independiente');
  const privadas = core.select(rows, false).length;
  const cisCount = rows.length - privadas;
  assert(privadas >= 480, 'Menos de 480 privadas: revisar cobertura, sin publicar');
  assert(cisCount >= 35, 'Menos de 35 CIS históricos');
  assert(reporte.entries > 0 && auditoria.length > 0, 'Electográfica vacía o sin registros aceptados');
  assert.equal(reporte.entries, auditoria.length + cuarentena.length, 'Auditoría incompleta');
  assert.equal(reporte.after.private, privadas);
  assert.equal(reporte.after.cis, cisCount);
  return {validado: true, privadas, cis: cisCount, wikipedia: wikipedia.encuestas.length,
    entradas: reporte.entries, auditadas: auditoria.length, cuarentena: cuarentena.length,
    periodo: reporte.period, preservacion: 'Radar versionado, CIS y Wikipedia comprobados por registro y campo'};
}

async function main() {
  const read = async p => JSON.parse(await readFile(p, 'utf8'));
  const dir = 'data/pipeline-test/';
  let result;
  try {
    result = verificar({original: await read('data/radar.json'), desarrollo: await read('data/radar-desarrollo.json'), cis: await read('data/cis-historico.json'),
      wikipedia: await read(dir+'wikipedia/radar.json'), combinado: await read(dir+'electografica/radar.json'),
      reporte: await read(dir+'electografica/report.json'), auditoria: await read(dir+'electografica/audit.json'),
      cuarentena: await read(dir+'electografica/quarantine.json')});
  } catch (error) {
    result = {validado: false, error: error.message};
    process.exitCode = 1;
  }
  await writeFile(dir+'integracion-validacion.json', JSON.stringify(result, null, 2)+'\n');
  await writeFile(dir+'integracion-resumen.md', result.validado
    ? `Prueba de integración: validada.\n\nPrivadas: ${result.privadas}; CIS: ${result.cis}; Wikipedia: ${result.wikipedia}.\n\nEntradas Electográfica: ${result.entradas}; auditadas: ${result.auditadas}; cuarentena: ${result.cuarentena}.\n\n${result.preservacion}. Umbrales mínimos: 480 privadas y 35 CIS; se admiten nuevas encuestas.\n\nDatos solo de prueba. Revisar también el resultado de todos los pasos y la cuarentena antes de cualquier uso.\n`
    : 'Prueba de integración NO validada. Consultar integracion-validacion.json y el paso fallido.\n');
  console.log(JSON.stringify(result));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
