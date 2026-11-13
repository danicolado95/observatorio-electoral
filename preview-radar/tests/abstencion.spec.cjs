'use strict';
const assert = require('node:assert/strict');
const data = require('../../analisis-cis/resultados/abstencion_3582.json');

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, actual + ' ≠ ' + expected);
const sum = (rows, field) => rows.reduce((total, row) => total + row[field], 0);
const categories = rows => rows.map(row => row.categoria);
const scores = Array.from({ length: 11 }, (_, score) => String(score));
const bands = ['0–3', '4–6', '7–9', '10'];
const groups = ['Votó en 2023', 'No votó en 2023'];
const intentions = ['Declara un partido', 'Voto en blanco', 'Voto nulo', 'No votaría', 'No sabe todavía', 'No contesta'];

function checkRows(rows, base, keys) {
  assert.deepEqual(categories(rows), keys);
  assert.equal(sum(rows, 'n'), base.n);
  close(sum(rows, 'suma_pesos'), base.suma_pesos);
  close(sum(rows, 'suma_pesos2'), base.suma_pesos2);
  close(sum(rows, 'porcentaje'), 100);
  for (const row of [base, ...rows]) {
    assert.ok(Number.isInteger(row.n) && row.n >= 0);
    assert.ok(row.n_efectivo <= row.n + 1e-8);
    close(row.n_efectivo, row.n ? row.suma_pesos ** 2 / row.suma_pesos2 : 0);
  }
  for (const row of rows) {
    assert.ok(row.porcentaje >= 0 && row.porcentaje <= 100);
    close(row.porcentaje, 100 * row.suma_pesos / base.suma_pesos);
    assert.equal(row.porcentaje === 0, row.n === 0);
  }
}

function checkProfile(profile) {
  checkRows(profile.distribucion, profile.base[0], scores);
  close(profile.maxima[0].porcentaje, profile.distribucion[10].porcentaje);
  close(profile.baja[0].porcentaje, sum(profile.distribucion.slice(0, 4), 'porcentaje'));
}

function checkData() {
  assert.equal(data.metadatos.estudio, 3582);
  checkProfile(data.distribucion.general);
  assert.deepEqual(Object.keys(data.matriz), groups);
  assert.deepEqual(Object.keys(data.distribucion.por_participacion_2023), groups);
  let zeros = 0;
  for (const [group, profile] of Object.entries(data.matriz)) {
    const distribution = data.distribucion.por_participacion_2023[group];
    checkProfile(distribution);
    assert.deepEqual(profile.base, distribution.base);
    checkRows(profile.distribucion, profile.base[0], bands);
    assert.deepEqual(Object.keys(profile.intencion_por_disposicion).sort(), [...bands].sort());
    for (const row of profile.distribucion) {
      const { codigos } = data.metadatos.mapeo.disposicion.find(item => item.categoria === row.categoria);
      close(row.porcentaje, sum([codigos].flat().map(score => distribution.distribucion[score]), 'porcentaje'));
      const detail = profile.intencion_por_disposicion[row.categoria];
      assert.equal(detail.base[0].n, row.n);
      close(detail.base[0].suma_pesos, row.suma_pesos);
      close(detail.base[0].n_efectivo, row.n_efectivo);
      checkRows(detail.distribucion, detail.base[0], intentions);
      zeros += detail.distribucion.filter(item => item.n === 0).length;
    }
  }
  assert.equal(zeros, 3);
  const nonvoters = data.matriz[groups[1]].distribucion;
  assert.deepEqual(nonvoters.map(row => row.n), [194, 46, 68, 143]);
  assert.deepEqual(nonvoters.map(row => +row.n_efectivo.toFixed(1)), [92.7, 25.8, 31.4, 68.9]);
  assert.deepEqual(Object.keys(data.explorador_social).sort(),
    ['EDAD', 'ESTUDIOS', 'ESCIDEOL', 'INGRESHOG', 'ECOPER', 'SITLAB', 'CLASESUB'].sort());
  for (const [variable, profiles] of Object.entries(data.explorador_social)) {
    assert.deepEqual(Object.keys(profiles), categories(data.metadatos.mapeo[variable]));
    Object.values(profiles).forEach(checkProfile);
  }
  for (const [mode, key] of [['por_recuerdo', 'RECUERDO'], ['por_intencion', 'INTENCIONGR_electorados']]) {
    const profiles = data.electorados[mode];
    assert.deepEqual(Object.keys(profiles), categories(data.metadatos.mapeo[key]));
    Object.values(profiles).forEach(checkProfile);
  }
}

async function checkBrowser() {
  const { chromium } = require('playwright');
  const server = require('../serve.cjs');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/#abstencion';
  const errors = [];
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.ATLAS_BROWSER || 'msedge' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.locator('#abs-content').waitFor();
    assert.equal(await page.locator('#abs-distribution li').count(), 11);
    assert.equal(await page.locator('#abs-comparison .abs-stack').count(), 2);
    const select = page.locator('#abs-variable');
    assert.equal(await select.locator('option').count(), 7);
    assert.equal(await select.evaluate(node => getComputedStyle(node).fontSize), '16px');
    for (const [variable, profiles] of Object.entries(data.explorador_social)) {
      await select.selectOption(variable);
      assert.equal(await page.locator('#abs-social li').count(), Object.keys(profiles).length);
    }
    const maxima = page.getByRole('button', { name: '10/10 · Máxima', exact: true });
    const previous = await page.locator('#abs-social strong').first().textContent();
    await maxima.press('Enter');
    assert.equal(await maxima.getAttribute('aria-pressed'), 'true');
    assert.notEqual(await page.locator('#abs-social strong').first().textContent(), previous);

    const matrix = page.locator('#abs-matrix button');
    assert.equal(await matrix.count(), 8);
    for (const [index, row] of Object.values(data.matriz).flatMap(group => group.distribucion).entries()) {
      const cell = matrix.nth(index);
      await cell.press(index % 2 ? 'Space' : 'Enter');
      assert.equal(await page.locator('#abs-matrix button[aria-pressed=true]').count(), 1);
      assert.equal(await cell.getAttribute('aria-pressed'), 'true');
      assert.deepEqual(await page.locator('#abs-intention-rows li > span:first-child').allTextContents(), intentions);
      assert.ok((await page.locator('#abs-intention-base').textContent()).includes('n = ' + new Intl.NumberFormat('es-ES', { useGrouping: 'always' }).format(row.n)));
    }
    await matrix.nth(5).press('Enter');
    assert.match(await page.locator('#abs-intention-base').textContent(), /n = 46 · n efectivo = 25,8 · Base pequeña/);
    assert.ok((await page.locator('#abs-intention-rows strong').allTextContents()).includes('0 %'));
    await matrix.nth(6).press('Space');
    assert.match(await page.locator('#abs-intention-base').textContent(), /n = 68 · n efectivo = 31,4 · Base pequeña/);
    await page.locator('#abs-ineligible-link').press('Enter');
    assert.equal(await page.locator('#abs-ineligible').evaluate(node => node.open), true);
    assert.match(await page.locator('#abs-ineligible-data').textContent(), /132.*41/);

    assert.equal(await page.locator('#abs-parties > li').count(), 4);
    await page.getByRole('button', { name: 'Intención de voto actual' }).press('Enter');
    assert.equal(await page.locator('#abs-parties > li').count(), 6);
    assert.match(await page.locator('#abs-parties').textContent(), /Podemos.*67,1 · Base pequeña.*SALF.*37,4 · Base pequeña/);

    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.locator('#abstencion').evaluate(node =>
        node.scrollWidth <= node.clientWidth && document.documentElement.scrollWidth <= innerWidth
      ), 'Desbordamiento a ' + width + ' px');
    }
    assert.deepEqual(errors, []);
    if (process.env.ATLAS_SCREENSHOTS) {
      await page.evaluate(() => {
        document.activeElement.blur();
        window.scrollTo({ top: 0, behavior: 'instant' });
      });
      await page.screenshot({ fullPage: true, path: process.env.ATLAS_SCREENSHOTS + '/abstencion-escritorio.png' });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ fullPage: true, path: process.env.ATLAS_SCREENSHOTS + '/abstencion-movil.png' });
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

async function main() {
  checkData();
  console.log('Datos de Abstención verificados.');
  if (!process.argv.includes('--data-only')) {
    await checkBrowser();
    console.log('Interacciones, teclado y anchuras de Abstención verificados.');
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
