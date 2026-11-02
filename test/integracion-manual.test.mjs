import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verificar} from '../scripts/validar-integracion-manual.mjs';
function fixture(extra = 0) {
  const encuestas = Array.from({length: 515 + extra}, (_, i) => ({estudio_id: String(i), instituto: i < 35 ? 'CIS' : 'Casa', resultados: {PP: 30}}));
  return {original: {encuestas: structuredClone(encuestas.slice(0, 35))}, desarrollo: {encuestas: structuredClone(encuestas)}, cis: {encuestas: structuredClone(encuestas.slice(0, 35))},
    wikipedia: {encuestas: structuredClone(encuestas.slice(0, 500))}, combinado: {encuestas},
    reporte: {entries: 2, after: {private: 480 + extra, cis: 35}, period: ['2023-07-23', '2026-11-02']},
    auditoria: [{}], cuarentena: [{}]};
}
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
