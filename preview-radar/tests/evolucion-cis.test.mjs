import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareHistory, latestTop, segments, shortLabel, nearestLine } from '../evolucion-cis.mjs';

const rows = JSON.parse(readFileSync(new URL('../../analisis-cis/datos-procesados/evolucion-preocupaciones.json', import.meta.url), 'utf8'));
const history = prepareHistory(rows);

test('verifica cobertura, porcentajes y top 5 de cada perspectiva', () => {
  assert.equal(rows.length, 6262);
  assert.equal(history.timeline.length, 35);
  assert.equal(history.series.size, 96);
  assert.equal(history.timeline[0].date, '2023-09-12');
  assert.equal(history.timeline.at(-1).date, '2026-10-06');
  assert.equal(history.timeline.at(-1).id, 3582);
  assert.ok(rows.every(row => Number.isFinite(row.porcentaje) && row.porcentaje >= 0 && row.porcentaje <= 100));
  assert.deepEqual(latestTop(history, 'Espana'), ['7', '18', '8', '9', '24']);
  assert.deepEqual(latestTop(history, 'Personal'), ['7', '8', '6', '9', '18']);
  assert.deepEqual(latestTop(history, 'both'), ['7', '18', '8', '9', '24', '6']);
});

test('mantiene separados los conceptos reutilizados y conserva las notas', () => {
  for (const code of [73, 90, 91, 93]) {
    const topics = [...history.series.values()].filter(topic => topic.code === code);
    assert.equal(topics.length, 2);
    const studies = topics.map(topic => new Set(Object.values(topic.points).flatMap(points => [...points.keys()])));
    assert.ok([...studies[0]].every(id => !studies[1].has(id)));
  }
  for (const code of [33, 42, 82]) {
    assert.ok(rows.filter(row => row.codigo === code).every(row => /revision conceptual/.test(row.comparabilidad)));
  }
});

test('distingue cero de ausencia y excluye la no respuesta del ranking', () => {
  const sample = prepareHistory([
    { ...rows[0], estudio: 1, fecha_fin: '2023-09-12', porcentaje: 0 },
    { ...rows[0], estudio: 2, fecha_fin: '2023-10-12', serie_id: 'NS', etiqueta: 'No sabe', porcentaje: 90 },
    { ...rows[0], estudio: 3, fecha_fin: '2023-11-12', porcentaje: 4 },
    { ...rows[0], estudio: 3, fecha_fin: '2023-11-12', serie_id: 'NC', etiqueta: 'N.C.', porcentaje: 95 },
  ]);
  assert.deepEqual(latestTop(sample, 'Espana'), ['1']);
  assert.deepEqual(segments(sample.timeline, sample.series.get('1').points.Espana)
    .map(run => run.map(point => point.value)), [[0], [4]]);
});

test('abrevia el top 5 y conserva el nombre oficial de otras series', () => {
  assert.deepEqual(latestTop(history, 'Espana').map(id => shortLabel(history.series.get(id))),
    ['Vivienda', 'Inmigración', 'Economía', 'Calidad del empleo', 'Política']);
  assert.equal(shortLabel(history.series.get('1')), history.series.get('1').label);
});

test('distingue las líneas cerca de un cruce y conserva el índice del punto', () => {
  const lines = [
    { id: 'a', runs: [[{ x: 0, y: 0, index: 0 }, { x: 20, y: 20, index: 1 }]] },
    { id: 'b', runs: [[{ x: 0, y: 20, index: 0 }, { x: 20, y: 0, index: 1 }]] },
  ];
  assert.deepEqual(nearestLine(lines, 14, 15), { id: 'a', index: 1 });
  assert.deepEqual(nearestLine(lines, 14, 5), { id: 'b', index: 1 });
  assert.equal(nearestLine(lines, 40, 40), null);
});
