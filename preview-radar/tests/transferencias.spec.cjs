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
    await page.goto('http://127.0.0.1:' + server.address().port + '/#transferencias');
    await page.locator('.transfer-row').first().waitFor();
    const select = page.locator('#transfer-party');
    const outgoing = page.locator('[data-mode="destino"]');
    const incoming = page.locator('[data-mode="origen"]');
    const toggle = page.locator('#transfer-toggle');
    const section = page.locator('#transferencias');
    assert.doesNotMatch(await section.innerText(), /ejemplo ficticio/i);
    async function checkView(key, party) {
      const otherKey = key === 'origen' ? 'destino' : 'origen';
      const group = rows.filter(row => row[key] === party);
      const total = group.reduce((sum, row) => sum + row.peso_total, 0);
      const keep = row => data.partidos_destacados.includes(row[otherKey])
        || /^(No sabe todavía|No votaría|No votó|N\.C\.|N\.R\.)$/.test(row[otherKey])
        || (key === 'destino' && row[otherKey].startsWith('No tenía'))
        || 100 * row.peso_total / total >= 2;
      const expected = group.filter(keep).map(row => row.peso_total);
      const remainder = group.filter(row => !keep(row)).reduce((sum, row) => sum + row.peso_total, 0);
      if (remainder) expected.push(remainder);

      async function checkBars(weights) {
        for (const selector of ['.transfer-segment', '.transfer-fill']) {
          const widths = await section.locator(selector).evaluateAll(nodes =>
            nodes.map(node => parseFloat(node.style.width)));
          assert.equal(widths.length, weights.length);
          assert.ok(Math.abs(widths.reduce((sum, width) => sum + width, 0) - 100) < 0.001);
          widths.sort((a, b) => a - b);
          weights.sort((a, b) => a - b);
          widths.forEach((width, i) => assert.ok(Math.abs(width - 100 * weights[i] / total) < 0.001));
        }
      }

      await checkBars(expected);
      if (remainder) {
        assert.match(await toggle.innerText(), key === 'origen' ? /destinos/ : /orígenes/);
        await toggle.press('Enter');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        await checkBars(group.map(row => row.peso_total));
        await toggle.press('Enter');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        await checkBars(expected);
      }
    }

    const bases = [1158, 835, 526, 294, 116, 63];
    for (const [index, party] of data.partidos_destacados.entries()) {
      await select.selectOption(party);
      assert.equal(await outgoing.isDisabled(), index >= 4);
      if (index < 4) {
        await outgoing.click();
        await checkView('origen', party);
      }
      await incoming.click();
      await checkView('destino', party);
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
    await page.evaluate(() => document.activeElement.blur());
    if (process.env.TRANSFER_SCREENSHOTS) await section.screenshot({ path: process.env.TRANSFER_SCREENSHOTS + '/transferencias-escritorio.png' });
    await page.setViewportSize({ width: 320, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({ width: 390, height: 844 });
    await select.selectOption('Podemos');
    assert.ok(await page.locator('#transfer-limited').isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.evaluate(() => document.activeElement.blur());
    if (process.env.TRANSFER_SCREENSHOTS) await section.screenshot({ path: process.env.TRANSFER_SCREENSHOTS + '/transferencias-movil.png' });
    assert.deepEqual(errors, []);
    console.log('240 celdas, 42 distribuciones, 10 vistas y 2 restricciones comprobadas.');
  } finally {
    await browser?.close();
    server.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
