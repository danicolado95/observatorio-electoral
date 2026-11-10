import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {esVarianteWikipedia40dB,original40dB} from '../scripts/original-40db.mjs';
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

test('40dB 9N: la variante de Wikipedia con FA desglosado no duplica la ficha original', () => {
  const wiki = {...original40dB,estudio_id:'wiki-9886f867b337e74f269e',
    ingestion:{source:'wikipedia'},referencias:[{url:original40dB.evidencia_publica[1].url}],
    resultados:{PP:31.9,PSOE:29.9,VOX:18,FA:3.9,FV:1.1,PODEMOS:1.2,SALF:2}};
  assert.equal(esVarianteWikipedia40dB(wiki),true);
  assert.equal(esVarianteWikipedia40dB({...wiki,referencias:[]}),false);
  assert.equal(esVarianteWikipedia40dB({...wiki,resultados:{...wiki.resultados,FV:0}}),false);
});
