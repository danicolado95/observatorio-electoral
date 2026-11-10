import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {conservarRevision} from '../scripts/revisiones-electografica.mjs';

const cases = JSON.parse(readFileSync(new URL('fixtures/revisiones-electografica-9-10n.json',import.meta.url),'utf8'));
for (const {day,candidate,audit,quarantine,canonical,wiki} of cases) {
  const previous = {encuestas:[canonical]};
  test(`Radar ${day}N: ${candidate.instituto} conserva identidad, resultados y evidencia anteriores`, () => {
    const result = conservarRevision(candidate,[wiki],previous,audit,quarantine);
    assert.deepEqual(result.canonical,canonical);
    assert.deepEqual(result.audit ?? result.quarantine,audit[0] ?? quarantine[0]);
    assert.notDeepEqual(candidate.resultados,canonical.resultados);
    assert.equal(conservarRevision(candidate,[wiki],previous,[],[]),null);
    assert.equal(conservarRevision(candidate,[wiki,wiki],previous,audit,quarantine),null);
    assert.equal(conservarRevision({...candidate,tamano_muestra:1},[wiki],previous,audit,quarantine),null);
    const modified = structuredClone(canonical);
    modified.resultados.PP = 0;
    assert.equal(conservarRevision(candidate,[wiki],{encuestas:[modified]},audit,quarantine),null);
  });
}
