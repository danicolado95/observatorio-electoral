import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const validador = resolve('scripts/validar-pipeline.mjs');

test('el validador acepta datos correctos y rechaza porcentajes alterados', async () => {
  const carpeta = await mkdtemp(join(tmpdir(), 'atlas-validacion-'));

  try {
    const historico = JSON.parse(
      await readFile('data/cis-historico.json', 'utf8')
    );

    const radar = JSON.parse(
      await readFile('data/radar.json', 'utf8')
    );

    const ejecutar = () => spawnSync(
      process.execPath,
      [validador],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          ATLAS_VALIDATION_DIR: carpeta
        }
      }
    );

    await writeFile(
      join(carpeta, 'cis-historico.json'),
      JSON.stringify(historico)
    );

    await writeFile(
      join(carpeta, 'radar-sincronizado.json'),
      JSON.stringify(radar)
    );

    const correcto = ejecutar();
    assert.equal(correcto.status, 0, correcto.stderr);

    const encuesta = radar.encuestas.find(e => e.instituto === 'CIS');
    assert.ok(encuesta, 'Debe existir una encuesta del CIS');

    encuesta.resultados.PSOE = 99;

    await writeFile(
      join(carpeta, 'radar-sincronizado.json'),
      JSON.stringify(radar)
    );

    const incorrecto = ejecutar();

    assert.notEqual(incorrecto.status, 0);
    assert.match(
      incorrecto.stderr,
      /porcentaje diferente para PSOE/
    );

    // Comprobar que se rechazan porcentajes fuera de rango
    const historicoInvalido = structuredClone(historico);
    const estudio = historicoInvalido.encuestas.find(
      e => e.instituto === 'CIS'
    );

    estudio.resultados.PSOE = 120;

    await writeFile(
      join(carpeta, 'cis-historico.json'),
      JSON.stringify(historicoInvalido)
    );

    const porcentajeImposible = ejecutar();

    assert.notEqual(porcentajeImposible.status, 0);
    assert.match(
      porcentajeImposible.stderr,
      /porcentajes electorales incorrectos/
    );

    // Comprobar que se rechazan estudios duplicados
    const historicoDuplicado = structuredClone(historico);

    historicoDuplicado.encuestas.push(
      structuredClone(historicoDuplicado.encuestas[0])
    );

    await writeFile(
      join(carpeta, 'cis-historico.json'),
      JSON.stringify(historicoDuplicado)
    );

    const duplicado = ejecutar();

    assert.notEqual(duplicado.status, 0);
    assert.match(
      duplicado.stderr,
      /histórico CIS y radar no coinciden/
    );
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
});
