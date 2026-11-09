'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const server = require('../serve.cjs');
const data = require('../data/transferencias_3582.json');

async function main() {
  const rows = data.celdas;
  assert.equal(rows.length, 240);
  assert.equal(new Set(rows.map(row => JSON.stringify([row.origen, row.destino]))).size, rows.length);
  assert.equal(rows.reduce((sum, row) => sum + row.n, 0), 5024);
  assert.ok(Math.abs(rows.reduce((sum, row) => sum + row.peso_total, 0) - data.suma_pesos) < 1e-6);
  for (const [key, percent, count] of [['origen', 'pct_destino', 20], ['destino', 'pct_origen', 22]]) {
    const labels = new Set(rows.map(row => row[key]));
    assert.equal(labels.size, count);
    for (const label of labels) {
      const group = rows.filter(row => row[key] === label);
      const weight = group.reduce((sum, row) => sum + row.peso_total, 0);
      assert.ok(Math.abs(group.reduce((sum, row) => sum + row[percent], 0) - 100) < 1e-8);
      for (const row of group) assert.ok(Math.abs(row[percent] - 100 * row.peso_total / weight) < 1e-8);
    }
  }
  for (const [origin, destination, field, expected] of [
    ['PSOE','PSOE','pct_destino',63.6], ['PP','PP','pct_destino',62.7],
    ['VOX','VOX','pct_destino',73.2], ['Sumar','Sumar','pct_destino',30.3],
    ['Sumar','Podemos','pct_destino',16.3], ['Sumar','PSOE','pct_destino',12.5],
    ['Sumar','No sabe todavía','pct_destino',21.8], ['Sumar','Podemos','pct_origen',70.2],
    ['VOX','Se Acabó la Fiesta','pct_origen',38.4]
  ]) assert.equal(Number(rows.find(row => row.origen === origin && row.destino === destination)[field].toFixed(1)), expected);

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/preview-radar/#transferencias');
    await page.locator('.transfer-row').first().waitFor();
    const select = page.locator('#transfer-party');
    const outgoing = page.locator('[data-mode="destino"]');
    const incoming = page.locator('[data-mode="origen"]');
    const bases = [1158, 835, 526, 294, 116, 63];
    for (const [index, party] of data.partidos_destacados.entries()) {
      await select.selectOption(party);
      assert.equal(await outgoing.isDisabled(), index >= 4);
      if (index < 4) {
        await outgoing.click();
        assert.equal(await page.locator('.transfer-row').count(), rows.filter(row => row.origen === party).length);
      }
      await incoming.click();
      assert.equal(await page.locator('.transfer-row').count(), rows.filter(row => row.destino === party).length);
      assert.equal(rows.filter(row => row.destino === party).reduce((sum, row) => sum + row.n, 0), bases[index]);
    }
    await select.selectOption('Sumar');
    await outgoing.click();
    const detail = page.locator('.transfer-row summary').first();
    await detail.focus();
    await detail.press('Enter');
    assert.ok(await page.locator('.transfer-row details[open] .transfer-detail').first().isVisible());
    await detail.press('Escape');
    assert.equal(await page.locator('.transfer-row details[open]').count(), 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    if (process.env.TRANSFER_SCREENSHOTS) await page.screenshot({ path: process.env.TRANSFER_SCREENSHOTS + '/transferencias-escritorio.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await select.selectOption('Podemos');
    assert.ok(await page.locator('#transfer-limited').isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.evaluate(() => window.scrollTo(0, 0));
    if (process.env.TRANSFER_SCREENSHOTS) await page.screenshot({ path: process.env.TRANSFER_SCREENSHOTS + '/transferencias-movil.png' });
    assert.deepEqual(errors, []);
    console.log('240 celdas, 42 distribuciones, 10 vistas y 2 restricciones comprobadas.');
  } finally {
    await browser?.close();
    server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
