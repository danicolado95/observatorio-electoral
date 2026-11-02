import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verificar, auditar} from '../scripts/validar-integracion-manual.mjs';
function fixture(extra = 0) {
  const encuestas = Array.from({length: 515 + extra}, (_, i) => ({estudio_id: String(i), instituto: i < 35 ? 'CIS' : 'Casa', resultados: {PP: 30}}));
  return {original: {encuestas: structuredClone(encuestas.slice(0, 35))}, desarrollo: {encuestas: structuredClone(encuestas)}, cis: {encuestas: structuredClone(encuestas.slice(0, 35))},
    wikipedia: {encuestas: structuredClone(encuestas.slice(0, 500))}, combinado: {encuestas},
    reporte: {entries: 2, after: {private: 480 + extra, cis: 35}, period: ['2023-07-23', '2026-11-02']},
    auditoria: [{}], cuarentena: [{}]};
}

function fixtureAlta() {
  const d = fixture();
  const cases = JSON.parse(readFileSync(new URL('fixtures/altas-complementarias.json', import.meta.url)));
  d.auditoria = cases.map(c => structuredClone(c.audit));
  d.cuarentena = [];
  d.reporte.entries = cases.length;
  for (const [i, c] of cases.entries()) {
    d.desarrollo.encuestas[35 + i] = structuredClone(c.historico);
    d.combinado.encuestas[35 + i] = structuredClone(c.audit.extracted);
    d.wikipedia.encuestas = d.wikipedia.encuestas.filter(p => p.estudio_id !== String(35 + i));
  }
  return d;
}

test('17 altas reales: complementos con misma identidad, hash e instantes, sin mutación', () => {
  const d = fixtureAlta(), before = structuredClone(d);
  assert.equal(verificar(d).validado, true);
  assert.equal(verificar(d).validado, true);
  assert.deepEqual(d, before);
});

test('conflictos reales FA: permanecen bloqueados con causa y variantes, sin resolver alias', () => {
  const d = fixture();
  const cases = JSON.parse(readFileSync(new URL('fixtures/conflictos-reales.json', import.meta.url)));
  d.auditoria = [{}]; d.cuarentena = cases.map(c => c.rechazado); d.reporte.entries = 3;
  for (const [i, c] of cases.entries()) {
    d.desarrollo.encuestas[35+i] = c.historico;
    d.combinado.encuestas[35+i] = c.wikipedia;
    d.wikipedia.encuestas[35+i] = structuredClone(c.wikipedia);
  }
  const before = structuredClone(d), result = auditar(d);
  assert.equal(result.validado, false);
  assert.equal(result.incidencias.filter(i => i.codigo === 'ALIAS_NO_RESUELTO').length, 2);
  assert.equal(result.incidencias.filter(i => i.codigo === 'DEPENDENCIA_NO_EVALUABLE').length, 2);
  for (const i of result.incidencias.filter(i => i.codigo === 'ALIAS_NO_RESUELTO')) {
    assert.match(i.evidencia, /candidatos en cuarentena/);
    assert.match(i.evidencia, /FA/);
  }
  assert.deepEqual(d, before);
});

test('altas complementarias: rechaza origen ambiguo, revisiones, valores cambiados y extras inventados', () => {
  for (const mutate of [
    d => d.auditoria.push(structuredClone(d.auditoria[0])),
    d => d.auditoria.shift(),
    d => d.auditoria[0].id = 'otro',
    d => d.auditoria[0].url = 'https://example.org/otro',
    d => d.auditoria[0].extracted.ingestion.content_sha256 = 'f'.repeat(64),
    d => {d.combinado.encuestas[35].ingestion.content_sha256 = 'f'.repeat(64); d.auditoria[0].extracted.ingestion.content_sha256 = 'f'.repeat(64);},
    d => d.combinado.encuestas[35].resultados.PP = 0,
    d => delete d.combinado.encuestas[35].resultados.PP,
    d => d.combinado.encuestas[35].resultados.FA = 0,
    d => d.combinado.encuestas[35].fuente = 'https://example.org/otro',
    d => d.combinado.encuestas[35].ingestion.blogger_updated = '2026-11-02T00:00:00Z',
  ]) {const d = fixtureAlta(); mutate(d); assert.equal(auditar(d).validado, false);}
});
test('admite nuevas encuestas y referencias añadidas sin exigir cifras exactas', () => {
  const data = fixture(3);
  data.combinado.encuestas[0].fuentes_adicionales = [{url: 'https://example.org'}];
  assert.equal(verificar(data).privadas, 483);
});
test('rechaza pérdidas, cambios, duplicados, vacíos y cobertura insuficiente', () => {
  for (const mutate of [
    d => d.combinado.encuestas.shift(),
    d => d.combinado.encuestas[0].resultados.PP = 99,
    d => d.combinado.encuestas.push(d.combinado.encuestas[0]),
    d => d.combinado.encuestas = [],
    d => d.combinado.encuestas.pop(),
    d => d.reporte.entries = 3,
    d => d.auditoria = [],
    d => {d.wikipedia.encuestas[0].fuentes_adicionales = [{url: 'https://example.org/perdida'}];},
  ]) {
    const data = fixture(); mutate(data);
    assert.throws(() => verificar(data));
  }
});

// Datos reales del histórico; reproduce la decisión cruzada confirmada en el artifact.
function fixtureAlias() {
  const data = fixture();
  const history = JSON.parse(readFileSync(new URL('../data/radar-desarrollo.json', import.meta.url)));
  const p = structuredClone(history.encuestas.find(p => p.estudio_id === 'electografica-2ba97db6772045cc3d26'));
  const q = {...structuredClone(p), estudio_id: 'wiki-dfee6d5ba160628c9d79', source_id: 'wikipedia'};
  delete q.ingestion;
  delete q.url_electografica;
  q.medio = 'Wikipedia';
  q.fuentes_adicionales = [{source: 'electografica', url: p.url_electografica,
    original: p.fuente, medio: p.medio, sha256: p.ingestion.content_sha256}];
  data.desarrollo.encuestas[35] = p;
  data.combinado.encuestas[35] = q;
  data.wikipedia.encuestas[35] = structuredClone(q);
  data.auditoria = [{id: p.ingestion.entry_id, url: p.url_electografica,
    extracted: structuredClone(p), decision: 'cruzada', estudio_id: q.estudio_id}];
  return data;
}

test('acepta el alias Hamalgama auditado conservando datos y origen', () => {
  assert.equal(verificar(fixtureAlias()).validado, true);
});

test('rechaza alias sin evidencia, ambiguos, con datos distintos o con origen perdido', () => {
  for (const mutate of [
    d => d.combinado.encuestas[35].resultados.PP = 32.5,
    d => delete d.combinado.encuestas[35].resultados.CC,
    d => d.combinado.encuestas[35].trabajo_campo_inicio = '2026-10-23',
    d => d.combinado.encuestas[35].trabajo_campo_fin = '2026-10-29',
    d => d.combinado.encuestas[35].instituto = 'Otro',
    d => d.combinado.encuestas[35].tamano_muestra = 900,
    d => d.combinado.encuestas[35].fuente = 'https://example.org/otra',
    d => d.combinado.encuestas[35].fuentes_adicionales = [],
    d => d.combinado.encuestas[35].fuentes_adicionales[0].sha256 = 'otro',
    d => d.auditoria = [{}],
    d => d.auditoria[0].decision = 'alta',
    d => d.auditoria[0].estudio_id = 'inexistente',
    d => d.auditoria[0].extracted.resultados.PP = 32.5,
    d => d.auditoria.push(structuredClone(d.auditoria[0])),
    d => delete d.desarrollo.encuestas[35].trabajo_campo_inicio,
    d => d.desarrollo.encuestas[35].fuentes_adicionales = [{url: 'https://example.org/perdida'}],
  ]) {
    const data = fixtureAlias(); mutate(data);
    assert.throws(() => verificar(data));
  }
});

for (const key of ['blogger_published', 'blogger_updated']) {
  test('Hamalgama: acepta zona equivalente en ' + key, () => {
    const data = fixtureAlias();
    data.desarrollo.encuestas[35].ingestion[key] = '2026-11-02T07:47:51.594+00:00';
    data.auditoria[0].extracted.ingestion[key] = '2026-11-02T08:47:51.594+01:00';
    assert.equal(verificar(data).validado, true);
  });
  for (const value of ['2026-11-02T08:47:51.595+01:00', 'malformado',
    '2026-02-30T07:47:51.594Z', '2026-11-02T24:00:00.000Z',
    '2026-11-02T07:47:51.594+24:00', null]) {
    test('Hamalgama: rechaza fecha distinta o inválida en ' + key + ': ' + value, () => {
      const data = fixtureAlias();
      data.desarrollo.encuestas[35].ingestion[key] = '2026-11-02T07:47:51.594+00:00';
      data.auditoria[0].extracted.ingestion[key] = value;
      assert.throws(() => verificar(data), /auditoría/);
    });
  }
  test('Hamalgama: rechaza fecha inválida idéntica en ' + key, () => {
    const data = fixtureAlias();
    data.desarrollo.encuestas[35].ingestion[key] = 'malformado';
    data.auditoria[0].extracted.ingestion[key] = 'malformado';
    assert.throws(() => verificar(data), /fecha de auditoría inválida/);
  });
  test('acepta instante equivalente para el mismo ID en ' + key, () => {
    const data = fixture();
    data.desarrollo.encuestas[35].ingestion = {[key]: '2026-11-02T07:47:51.594+00:00'};
    data.combinado.encuestas[35].ingestion = {[key]: '2026-11-02T08:47:51.594+01:00'};
    const before = structuredClone(data);
    assert.equal(verificar(data).validado, true);
    assert.deepEqual(data, before);
  });
}
for (const key of ['content_sha256', 'entry_id', 'source', 'otro_campo']) {
  test('Hamalgama: conserva comparación estricta en ingestion.' + key, () => {
    const data = fixtureAlias();
    data.auditoria[0].extracted.ingestion[key] = 'distinto';
    assert.throws(() => verificar(data), /auditoría distinta en ingestion/);
  });
}
test('Hamalgama: reproduce ambas fechas del fallo sin modificar los datos', () => {
  const data = fixtureAlias();
  for (const key of ['blogger_published', 'blogger_updated']) {
    data.desarrollo.encuestas[35].ingestion[key] = '2026-11-02T07:47:51.594+00:00';
    data.auditoria[0].extracted.ingestion[key] = '2026-11-02T08:47:51.594+01:00';
  }
  const before = structuredClone(data);
  assert.equal(verificar(data).validado, true);
  assert.deepEqual(data, before);
});

function fixtureComplementaria() {
  const d = fixtureAlias();
  for (const key of ['FA', 'CC', 'UPN']) delete d.wikipedia.encuestas[35].resultados[key];
  return d;
}
test('Hamalgama conserva FA5.4 CC0 UPN0.2, sin mutación ni duplicados', () => {
  const d = fixtureComplementaria(), before = structuredClone(d);
  assert.equal(verificar(d).validado, true);
  assert.equal(verificar(d).validado, true);
  assert.deepEqual(d, before);
  assert.equal(d.combinado.encuestas[35].resultados.FA, 5.4);
  assert.equal(d.combinado.encuestas[35].resultados.CC, 0);
  assert.equal(d.combinado.encuestas[35].resultados.UPN, 0.2);
});
test('complementarios rechaza conflicto en cualquier partido, cero perdido y extras sin origen', () => {
  for (const mutate of [
    d => d.wikipedia.encuestas[35].resultados.BNG = 0.9,
    d => d.wikipedia.encuestas[35].resultados.CC = 0.1,
    d => delete d.combinado.encuestas[35].resultados.CC,
    d => d.combinado.encuestas[35].resultados.SUMAR = 5.4,
    d => {delete d.combinado.encuestas[35].resultados.FA; d.combinado.encuestas[35].resultados.SUMAR = 5.4;},
    d => d.wikipedia.encuestas[35].fuente = 'https://example.org/otro',
    d => d.auditoria[0].decision = 'alta',
    d => d.auditoria.push(structuredClone(d.auditoria[0])),
  ]) {const d = fixtureComplementaria(); mutate(d); assert.throws(() => verificar(d));}
});
test('FA y SUMAR complementarios conservan valores independientes', () => {
  const d = fixtureComplementaria();
  d.wikipedia.encuestas[35].resultados.SUMAR = 3;
  d.combinado.encuestas[35].resultados.SUMAR = 3;
  assert.equal(verificar(d).validado, true);
});


test('acumula campos, partidos, referencias y registros independientes sin mutar', () => {
  const d = fixture();
  d.desarrollo.encuestas[35].fuentes_adicionales = [{url: 'https://example.org/1'}, {url: 'https://example.org/2'}];
  d.combinado.encuestas[35].instituto = 'Distinto';
  d.combinado.encuestas[35].resultados = {PP: 0, FA: 2};
  d.desarrollo.encuestas[35].resultados.FA = 0;
  d.combinado.encuestas.splice(36, 1);
  const before = structuredClone(d), informe = auditar(d);
  assert.equal(informe.validado, false);
  for (const campo of ['instituto', 'resultados.PP', 'resultados.FA', 'fuentes_adicionales']) {
    assert(informe.incidencias.some(i => i.estudio_id === '35' && i.campo === campo), campo);
  }
  assert.equal(informe.incidencias.filter(i => i.estudio_id === '35' && i.codigo === 'REFERENCIA_PERDIDA').length, 2);
  assert(informe.incidencias.some(i => i.estudio_id === '36' && i.severidad === 'no-evaluable'));
  assert.equal(informe.cobertura.desarrollo.registros.length, 515);
  assert.deepEqual(d, before);
  assert.deepEqual(auditar(d), informe);
  assert.throws(() => verificar(d), e => e instanceof AggregateError && e.informe.incidencias.length === informe.incidencias.length);
});

for (const key of ['blogger_published', 'blogger_updated']) {
  test('ID exacto: precisión decimal y zona equivalentes en ' + key, () => {
    const d = fixture();
    d.desarrollo.encuestas[35].ingestion = {[key]: '2026-11-02T08:20:07.630+01:00'};
    d.combinado.encuestas[35].ingestion = {[key]: '2026-11-02T07:20:07.63+00:00'};
    const before = structuredClone(d);
    assert.equal(verificar(d).validado, true);
    assert.deepEqual(d, before);
  });
  for (const value of ['2026-11-02T07:20:07.631Z', '2026-02-30T07:20:07.630Z', null]) {
    test('ID exacto rechaza instante distinto o inválido: ' + key + ' ' + value, () => {
      const d = fixture();
      d.desarrollo.encuestas[35].ingestion = {[key]: '2026-11-02T08:20:07.630+01:00'};
      d.combinado.encuestas[35].ingestion = {[key]: value};
      assert.equal(auditar(d).validado, false);
    });
  }
}
for (const key of ['content_sha256', 'entry_id', 'source']) {
  test('ID exacto: sigue siendo estricto en ' + key, () => {
    const d = fixture();
    d.desarrollo.encuestas[35].ingestion = {[key]: 'original'};
    d.combinado.encuestas[35].ingestion = {[key]: 'distinto'};
    assert.equal(auditar(d).validado, false);
  });
}
