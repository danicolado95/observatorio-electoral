import {comprobarCuarentena} from './reconciliaciones-documentadas.mjs';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const core = createRequire(import.meta.url)('../js/radar-core.js');

// Compara instantes sobre copias sin alterar los textos originales.
function normalizarFechasAuditoria(ingestion, label) {
  assert(ingestion && typeof ingestion === 'object' && !Array.isArray(ingestion), label + ': auditoría ingestion inválida');
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
function resolverAlias(p, ids, auditoria, label, cuarentena = []) {
  const matches = auditoria.filter(a => a.extracted?.estudio_id === p.estudio_id);
  const rechazados = cuarentena.filter(a => a.candidate?.estudio_id === p.estudio_id);
  const causa = rechazados.length ? '; candidatos en cuarentena: ' + JSON.stringify(rechazados.map(a => ({
    motivo: a.reason, candidato: a.candidate, coincidencias: a.matches
  }))) : '';
  assert.equal(matches.length, 1, label + ': alias sin auditoría única para ' + p.estudio_id + causa);
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
export function auditar({original, desarrollo, cis, wikipedia, combinado, reporte, auditoria, cuarentena}) {
  const incidencias = [];
  const registrar = (error, fuente, estudio_id = null, campo = null, codigo = 'DIVERGENCIA', esperado = null, observado = null, severidad = 'critica') => {
    incidencias.push({etapa: 'integracion', fuente, estudio_id, campo, codigo, esperado, observado, evidencia: error.message, severidad});
  };
  const comprobar = (fn, ...contexto) => {try {return fn();} catch (error) {registrar(error, ...contexto);}};
  const entradas = {original, desarrollo, cis, wikipedia, combinado};
  for (const [fuente, data] of Object.entries(entradas)) {
    if (!Array.isArray(data?.encuestas)) registrar(Error('Falta colección de encuestas'), fuente, null, 'encuestas', 'ENTRADA_NO_EVALUABLE', 'array', data ?? null);
  }
  for (const [fuente, data] of Object.entries({auditoria, cuarentena})) {
    if (!Array.isArray(data)) registrar(Error('Falta colección de auditoría'), fuente, null, fuente, 'ENTRADA_NO_EVALUABLE', 'array', data ?? null);
  }
  if (!reporte?.after) registrar(Error('Falta reporte de importación'), 'reporte', null, 'after', 'ENTRADA_NO_EVALUABLE');
  const inventario = () => Object.fromEntries(Object.entries(entradas).filter(([, data]) => Array.isArray(data?.encuestas)).map(([fuente, data]) => [fuente, {
    total: data.encuestas.length, privadas: core.select(data.encuestas, false).length,
    cis: data.encuestas.length - core.select(data.encuestas, false).length,
    referencias: data.encuestas.reduce((n, p) => n + (p.fuentes_adicionales?.length ?? 0), 0),
    registros: data.encuestas.map(p => ({estudio_id: p.estudio_id, clasificacion: core.select([p], false).length ? 'privada' : 'CIS',
      referencias: p.fuentes_adicionales?.length ?? 0}))
  }]));
  if (!Array.isArray(combinado?.encuestas)) {
    registrar(Error('Conservación no evaluable sin radar combinado'), 'combinado', null, '*', 'DEPENDENCIA_NO_EVALUABLE', 'radar combinado', null, 'no-evaluable');
    return {validado: false, incidencias, cobertura: inventario()};
  }
  auditoria = Array.isArray(auditoria) ? auditoria : [];
  cuarentena = Array.isArray(cuarentena) ? cuarentena : [];
  reporte = reporte ?? {};
  const rows = combinado.encuestas;
  comprobar(() => assert(rows.length, 'Radar combinado vacío'), 'combinado', null, 'encuestas', 'RADAR_VACIO', '>0', rows.length);
  const ids = new Map(rows.map(p => [p.estudio_id, p]));
  const vistos = new Set();
  for (const p of rows) {
    if (vistos.has(p.estudio_id)) registrar(Error('Identidades duplicadas'), 'combinado', p.estudio_id, 'estudio_id', 'ID_DUPLICADO', 'único', p.estudio_id);
    vistos.add(p.estudio_id);
  }
  const conservar = (polls, label) => {
    for (const p of polls) {
      // La variante incompatible se conserva íntegra en la cuarentena del lote.
      // Solo esta decisión documental exacta permite no usarla como canónica.
      if(label === 'Wikipedia independiente') {
        const proofs=[...cuarentena,...(combinado.reconciliaciones_anteriores||[])].filter(c=>c.reconciliacion?.wikipedia?.estudio_id===p.estudio_id);
        if(proofs.length===1) {
          const c=proofs[0],r=c.reconciliacion,q=ids.get(r.historico?.estudio_id);
          let valido=false;
          try {valido=comprobarCuarentena(c,p,q)&&!ids.has(p.estudio_id);} catch {}
          if(valido) continue;
        }
      }
      const mismoId = ids.has(p.estudio_id);
      const q = mismoId ? ids.get(p.estudio_id) : comprobar(() => resolverAlias(p, ids, auditoria, label, cuarentena), label, p.estudio_id, 'estudio_id', 'ALIAS_NO_RESUELTO', p.estudio_id, null);
      if (!q) {
        registrar(Error('Comparación no evaluable: identidad no resuelta'), label, p.estudio_id, '*', 'DEPENDENCIA_NO_EVALUABLE', p, null, 'no-evaluable');
        continue;
      }
      for (const [key, value] of Object.entries(p)) {
        comprobar(() => {
        // Electográfica puede añadir referencias, pero no quitar las existentes.
        if (!mismoId && ['estudio_id', 'ingestion', 'source_id', 'url_electografica', 'medio'].includes(key)) return;
        if (key === 'fuentes_adicionales') {
  for (const ref of value) {
    comprobar(() => assert(
      q[key]?.some(r => isDeepStrictEqual(r, ref)),
      `${label}: referencia perdida en ${p.estudio_id}: ${JSON.stringify({
        esperada: ref,
        actuales: q[key] ?? []
      })}`
    ), label, p.estudio_id, key, 'REFERENCIA_PERDIDA', ref, q[key] ?? []);
  }
} else if (key === 'resultados' && !isDeepStrictEqual(q[key], value)) {
          // Ausencia no equivale a cero; todo valor previo debe conservarse.
          for (const [party, percent] of Object.entries(value)) {
            comprobar(() => assert(q.resultados && Object.hasOwn(q.resultados, party) && q.resultados[party] === percent,
              label + ': cambió resultados.' + party), label, p.estudio_id, 'resultados.' + party, 'RESULTADO_MODIFICADO', percent, q.resultados?.[party] ?? null);
          }
          const altas = auditoria.filter(a => a.decision === 'alta' && a.estudio_id === q.estudio_id && a.extracted?.estudio_id === q.estudio_id);
          if (mismoId && altas.length) {
            // Una alta reconstruida desde la misma entrada no es un alias.
            // El hash histórico se sigue comparando fuera de esta rama: una
            // revisión de contenido nunca autoriza por sí sola nuevos valores.
            assert.equal(altas.length, 1, label + ': alta sin auditoría única');
            const a = altas[0], e = a.extracted;
            assert(e.ingestion?.source === 'electografica' && e.source_id === 'electografica' &&
              e.ingestion.entry_id && /^[a-f0-9]{64}$/.test(e.ingestion.content_sha256) &&
              a.id === e.ingestion.entry_id && a.url === e.url_electografica,
              label + ': alta sin origen comprobable');
            for (const [field, observed] of Object.entries(q)) {
              if (field === 'fuentes_adicionales') continue;
              assert.deepEqual(field === 'ingestion' ? normalizarFechasAuditoria(observed, label) : observed,
                field === 'ingestion' ? normalizarFechasAuditoria(e[field], label) : e[field],
                label + ': alta distinta en ' + field);
            }
            // Todos los complementos, incluidos ceros y FA/SUMAR, deben estar
            // presentes literalmente en la extracción auditada.
            assert.deepEqual(q.resultados, e.resultados, label + ': resultados del alta distintos');
            return;
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
            const bases = (wikipedia?.encuestas ?? []).filter(w => w.estudio_id === q.estudio_id);
            const fromWiki = bases.length === 1 && Object.hasOwn(bases[0].resultados, party) && bases[0].resultados[party] === q.resultados[party];
            assert(Object.hasOwn(value, party) || Object.hasOwn(e.resultados, party) || fromWiki, label + ': extra sin origen en ' + party);
          }
        } else if (key === 'ingestion') {
          assert.deepEqual(normalizarFechasAuditoria(q[key], label), normalizarFechasAuditoria(value, label), label + ': cambió auditoría en ingestion');
        } else assert.deepEqual(q[key], value, `${label}: cambió ${p.estudio_id}.${key}`);
        }, label, p.estudio_id, key, 'CAMPO_MODIFICADO', value, q[key] ?? null);
      }
    }
  };
  conservar(original?.encuestas ?? [], 'Radar versionado');
  conservar(desarrollo?.encuestas ?? [], 'Histórico de desarrollo versionado');
  conservar(cis?.encuestas ?? [], 'CIS histórico versionado');
  conservar(wikipedia?.encuestas ?? [], 'Wikipedia independiente');
  const privadas = core.select(rows, false).length;
  const cisCount = rows.length - privadas;
  comprobar(() => assert(privadas >= 480, 'Menos de 480 privadas: revisar cobertura, sin publicar'), 'cobertura', null, 'reporte', 'COBERTURA_INVALIDA');
  comprobar(() => assert(cisCount >= 35, 'Menos de 35 CIS históricos'), 'cobertura', null, 'reporte', 'COBERTURA_INVALIDA');
  comprobar(() => assert(reporte.entries > 0 && auditoria.length > 0, 'Electográfica vacía o sin registros aceptados'), 'cobertura', null, 'reporte', 'COBERTURA_INVALIDA');
  comprobar(() => assert.equal(reporte.entries, auditoria.length + cuarentena.length, 'Auditoría incompleta'), 'cobertura', null, 'reporte', 'COBERTURA_INVALIDA');
  comprobar(() => assert.equal(reporte.after?.private, privadas), 'cobertura', null, 'reporte', 'COBERTURA_INVALIDA');
  comprobar(() => assert.equal(reporte.after?.cis, cisCount), 'cobertura', null, 'reporte', 'COBERTURA_INVALIDA');
  const cobertura = inventario();
  return {reconciliaciones: [...cuarentena,...(combinado.reconciliaciones_anteriores||[])].filter(c=>c.reconciliacion).map(c=>c.reconciliacion), validado: !incidencias.some(i => i.severidad === 'critica'), incidencias, cobertura, privadas, cis: cisCount, wikipedia: wikipedia?.encuestas?.length ?? null,
    entradas: reporte.entries, auditadas: auditoria.length, cuarentena: cuarentena.length,
    periodo: reporte.period, preservacion: incidencias.length ? 'Auditoría bloqueada: consultar incidencias' : 'Radar versionado, CIS y Wikipedia comprobados por registro y campo'};
}

export function verificar(data) {
  const informe = auditar(data);
  if (!informe.validado) {
    const error = new AggregateError(informe.incidencias.map(i => Error(i.evidencia)), informe.incidencias.map(i => i.evidencia).join('\n'));
    error.informe = informe;
    throw error;
  }
  return informe;
}

async function main() {
  const dir = 'data/pipeline-test/';
  await mkdir(dir, {recursive: true});
  const paths = {original: 'data/radar.json', desarrollo: 'data/radar-desarrollo.json', cis: 'data/cis-historico.json',
    wikipedia: dir+'wikipedia/radar.json', combinado: dir+'electografica/radar.json', reporte: dir+'electografica/report.json',
    auditoria: dir+'electografica/audit.json', cuarentena: dir+'electografica/quarantine.json'};
  const datos = {}, fallos = [];
  await Promise.all(Object.entries(paths).map(async ([fuente, path]) => {
    try {datos[fuente] = JSON.parse(await readFile(path, 'utf8'));}
    catch (error) {fallos.push({etapa: 'lectura', fuente, estudio_id: null, campo: null, codigo: 'FUENTE_NO_DISPONIBLE',
      esperado: 'JSON legible', observado: path, evidencia: error.message, severidad: 'critica'});}
  }));
  let result;
  try {result = auditar(datos);}
  catch (error) {result = {validado: false, incidencias: [{etapa: 'integracion', fuente: 'estructura', estudio_id: null,
    campo: null, codigo: 'ESTRUCTURA_INVALIDA', esperado: 'registros válidos', observado: null, evidencia: error.message, severidad: 'critica'}]};}
  result.incidencias = [...fallos.sort((a,b) => a.fuente.localeCompare(b.fuente)), ...result.incidencias];
  if (fallos.length || !result.validado) {result.validado = false; process.exitCode = 1;}
  await writeFile(dir+'integracion-validacion.json', JSON.stringify(result, null, 2)+'\n');
  await writeFile(dir+'integracion-resumen.md', result.validado
    ? `Prueba de integración: validada.\n\nPrivadas: ${result.privadas}; CIS: ${result.cis}; Wikipedia: ${result.wikipedia}.\n\nEntradas Electográfica: ${result.entradas}; auditadas: ${result.auditadas}; cuarentena: ${result.cuarentena}.\n\n${result.preservacion}. Reconciliaciones documentadas: ${result.reconciliaciones.length}.\n\n${result.reconciliaciones.map(r => `${r.candidato.instituto}: ${r.motivo} Diferencias: ${JSON.stringify(r.diferencias ?? [])}`).join("\n\n")}\n\nUmbrales mínimos: 480 privadas y 35 CIS; se admiten nuevas encuestas.\n\nDatos solo de prueba. Revisar también el resultado de todos los pasos y la cuarentena antes de cualquier uso.\n`
    : 'Prueba de integración NO validada. Consultar integracion-validacion.json y el paso fallido.\n');
  console.log(JSON.stringify({validado:result.validado,privadas:result.privadas,cis:result.cis,entradas:result.entradas,auditadas:result.auditadas,cuarentena:result.cuarentena,incidencias:result.incidencias}));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
