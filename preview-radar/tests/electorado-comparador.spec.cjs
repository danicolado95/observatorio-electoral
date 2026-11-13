'use strict';
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const server = require('../serve.cjs');
const data = require('../../analisis-cis/resultados/electorado_personales_3582.json');
const national = require('../../analisis-cis/resultados/electorado_3582.json');
const {metadata, ranking_comparado: ranking, solapamientos: overlap} = data;
const format = new Intl.NumberFormat('es-ES', {maximumFractionDigits: 2});
const pct = value => value > 0 && value < 0.005 ? '<0,01 %' : format.format(value) + ' %';
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, actual + ' ≠ ' + expected);

function auditData() {
 assert.deepEqual(metadata.pregunta_nacional, ['PESPANNA1', 'PESPANNA2', 'PESPANNA3']);
 assert.deepEqual(metadata.pregunta_personal, ['PPERSONAL1', 'PPERSONAL2', 'PPERSONAL3']);
 assert.equal(ranking.length, 72);
 assert.equal(overlap.length, 288);
 assert.equal(new Set(ranking.map(row => row.problema)).size, 72);
 assert.equal(new Set(ranking.map(row => row.codigo)).size, 72);
 for (const row of ranking) {
  const [both, spain, personal, neither] = [
   'En ambas preguntas', 'Solo como problema de España', 'Solo como problema personal', 'En ninguna'
  ].map(label => {
   const matching = overlap.filter(item => item.problema === row.problema && item.situacion === label);
   assert.equal(matching.length, 1);
   return matching[0];
  });
  assert.equal(both.n + spain.n + personal.n + neither.n, 5024);
  near(both.porcentaje + spain.porcentaje + personal.porcentaje + neither.porcentaje, 100);
  assert.equal(both.n + spain.n, row.menciones_espana);
  assert.equal(both.n + personal.n, row.menciones_personales);
  near(both.porcentaje + spain.porcentaje, row.porcentaje_espana);
  near(both.porcentaje + personal.porcentaje, row.porcentaje_personal);
  near(row.porcentaje_espana - row.porcentaje_personal, row.diferencia_pp);
  const original = national.ranking_nacional.find(item => item.codigo === row.codigo);
  if (original) {
   assert.equal(row.problema, original.problema);
   assert.equal(row.menciones_espana, original.menciones);
   near(row.porcentaje_espana, original.porcentaje);
  } else {
   assert.equal(row.menciones_espana, 0);
  }
 }
}

async function run() {
 auditData();
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 let browser;
 try {
  browser = await chromium.launch({channel: 'msedge', headless: true});
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = 'http://127.0.0.1:' + server.address().port + '/preview-radar/#electorado';
  await page.goto(url);
  await page.locator('#el-compare-content').waitFor();
  await page.locator('#el-content').waitFor();
  assert.equal(await page.locator('#el-problem option').count(), 69);
  const buttons = page.locator('#el-compare-ranking button');
  const select = page.locator('#el-compare-problem');
  const search = page.locator('#el-compare-search');
  assert.equal(await select.locator('option').count(), 72);
  assert.deepEqual(await buttons.locator('span').allTextContents(),
   [...ranking].sort((a, b) => Math.abs(b.diferencia_pp) - Math.abs(a.diferencia_pp)).map(row => row.problema));
  await page.getByText('¿Son las mismas personas?', {exact: true}).click();
  for (const row of ranking) {
   await select.selectOption(String(row.codigo));
   assert.equal(await page.locator('#el-compare-topic').textContent(), row.problema);
   const values = await page.locator('#el-compare-bars strong').allTextContents();
   assert.deepEqual(values, [pct(row.porcentaje_espana), pct(row.porcentaje_personal)]);
   const cases = overlap.filter(item => item.problema === row.problema);
   for (const item of cases) {
    const bar = page.locator('#el-compare-overlap li').filter({has: page.getByText(item.situacion, {exact: true})});
    assert.equal(await bar.locator('strong').textContent(), pct(item.porcentaje));
    assert.ok((await bar.locator('small').textContent()).startsWith(format.format(item.n)));
   }
  }
  await search.fill('educacion');
  assert.ok((await select.locator('option').allTextContents()).some(text => text.includes('educación')));
  await search.fill('hipotecas');
  assert.equal(await select.locator('option').count(), 1);
  assert.match(await page.locator('#el-compare-bars').textContent(), /Cero observado.*menos de 30 casos/);
  await search.fill('zzzzzz');
  assert.equal(await select.isDisabled(), true);
  assert.equal(await page.locator('#el-compare-detail').isVisible(), false);
  await buttons.first().focus();
  await page.keyboard.press('Enter');
  assert.equal(await search.inputValue(), '');
  assert.equal(await select.evaluate(element => document.activeElement === element), true);
  for (const width of [320, 390, 768, 1280]) {
   await page.setViewportSize({width, height: 900});
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  assert.deepEqual(errors, []);
  for (const broken of [null, {...data, solapamientos: overlap.slice(1)},
   {...data, ranking_comparado: [{...ranking[0], porcentaje_espana: null}, ...ranking.slice(1)]}]) {
   const failed = await browser.newPage();
   await failed.route('**/electorado_personales_3582.json', route =>
    broken ? route.fulfill({json: broken}) : route.fulfill({status: 404}));
   await failed.goto(url);
   await failed.getByText('Datos del comparador no disponibles', {exact: false}).waitFor();
   assert.equal(await failed.locator('#el-compare-content').isVisible(), false);
   await failed.locator('#el-content').waitFor();
   await failed.close();
  }
  console.log('Comparador: 72 temas y 288 solapamientos auditados en JSON y comprobados en Edge.');
 } finally {
  if (browser) await browser.close();
  server.close();
 }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
