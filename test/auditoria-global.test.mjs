import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {conservarReferencias} from '../scripts/referencias-historicas.mjs';

test('referencias: acumula conflictos independientes y no aplica cambios parciales', () => {
  const historico = JSON.parse(fs.readFileSync(new URL('../data/radar-desarrollo.json', import.meta.url)));
  const rows = structuredClone(historico.encuestas);
  const conRefs = rows.filter(p => p.fuentes_adicionales?.length);
  conRefs[0].instituto = 'Conflicto';
  conRefs[0].resultados.PP = 99;
  conRefs[1].fuente = 'https://example.org/conflicto';
  delete conRefs[2].fuentes_adicionales;
  const antes = structuredClone(rows);
  assert.throws(() => conservarReferencias(rows, historico.encuestas), error => {
    assert(error instanceof AggregateError);
    assert.equal(error.informe.incidencias.length, 3);
    assert(error.informe.incidencias.every(i => i.severidad === 'critica' && i.estudio_id && i.campo));
    return true;
  });
  assert.deepEqual(rows, antes);
});

test('CLI: fuentes ausentes se reúnen y dejan JSON bloqueante, también al repetir', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-auditoria-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const script = new URL('../scripts/validar-integracion-manual.mjs', import.meta.url);
  const leer = () => JSON.parse(fs.readFileSync(path.join(dir, 'data/pipeline-test/integracion-validacion.json')));
  const run = () => spawnSync(process.execPath, [fileURLToPath(script)], {cwd: dir, encoding: 'utf8'});
  assert.equal(run().status, 1);
  const primero = leer();
  assert.equal(primero.validado, false);
  assert.equal(primero.incidencias.filter(i => i.codigo === 'FUENTE_NO_DISPONIBLE').length, 8);
  assert.equal(run().status, 1);
  assert.deepEqual(leer(), primero);
});

test('importador persiste conflictos de referencias sin sustituir radar previo', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-referencias-fallo-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const history = JSON.parse(fs.readFileSync(new URL('../data/radar-desarrollo.json', import.meta.url)));
  const base = structuredClone(history), conRefs = base.encuestas.filter(p => p.fuentes_adicionales?.length);
  conRefs[0].resultados.PP = 99;
  conRefs[1].fuente = 'https://example.org/conflicto';
  const data = path.join(dir, 'data'), pipeline = path.join(data, 'pipeline-test');
  fs.mkdirSync(path.join(pipeline, 'wikipedia'), {recursive: true});
  fs.mkdirSync(path.join(pipeline, 'electografica'));
  fs.writeFileSync(path.join(data, 'radar-desarrollo.json'), JSON.stringify(history));
  fs.writeFileSync(path.join(pipeline, 'wikipedia/radar.json'), JSON.stringify(base));
  const target = path.join(pipeline, 'electografica/radar.json');
  fs.writeFileSync(target, JSON.stringify({encuestas: []}));
  const antes = fs.readFileSync(target);
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/importar-electografica.mjs', import.meta.url)), '--as-of', '2026-11-02'],
    {env: {...process.env, ELECTOGRAFICA_TEST_ROOT: dir}, encoding: 'utf8'});
  assert.notEqual(r.status, 0);
  const informe = JSON.parse(fs.readFileSync(path.join(pipeline, 'integracion-validacion.json')));
  assert.equal(informe.validado, false);
  assert.equal(informe.incidencias.filter(i => i.codigo === 'CONFLICTO_REFERENCIA').length, 2);
  assert(informe.incidencias.some(i => i.codigo === 'SNAPSHOT_INCOMPLETO'));
  assert(informe.incidencias.some(i => i.codigo === 'FEED_NO_EVALUABLE'));
  assert(informe.incidencias.some(i => i.codigo === 'LECTURA_INVALIDA'));
  assert.deepEqual(fs.readFileSync(target), antes);
});

