import test from 'node:test';
import assert from 'node:assert/strict';
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
