const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const server = require('../serve.cjs');
const data = require('../../analisis-cis/resultados/electorado_social_3582.json');
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, a+' != '+b);
const sum = (rows,key) => rows.reduce((total,row)=>total+row[key],0);
const fmt = new Intl.NumberFormat('es-ES',{maximumFractionDigits:1});
const pct = n => n>0&&n<.05 ? '<0,1 %' : fmt.format(n)+' %';
(async () => {
 const {metadata,cruces,distribuciones_generales} = data;
 const dims = metadata.dimensiones;
 assert.equal(dims.length,8);
 assert.equal(cruces.length,2154);
 const pairs = Map.groupBy(cruces,r=>r.dimension_grupo+'/'+r.dimension_categoria);
 assert.equal(pairs.size,56);
 const overview = Map.groupBy(distribuciones_generales,r=>r.dimension);
 const flags = Object.fromEntries([...Map.groupBy(cruces,r=>r.nivel_informacion)].map(([k,v])=>[k,v.length]));
 assert.deepEqual(flags,{'Celda muy pequena':189,'Grupo muy pequeno':126,'Informacion suficiente':1454,'Interpretar con cautela':340,'Sin casos observados':45});
 let groups = 0;
 for(const rows of overview.values()) {
  close(sum(rows,'porcentaje'),100);
  assert.equal(sum(rows,'n'),rows[0].n_validos);
  assert.equal(rows[0].n_validos+rows[0].n_excluidos,5024);

 }
 for(const [key,rows] of pairs) {
  const [g,c] = key.split('/');
  const categories = Map.groupBy(rows,r=>r.categoria);
  const byGroup = Map.groupBy(rows,r=>r.grupo);
  groups+=byGroup.size;
  close(sum([...categories.values()].map(rr=>rr[0]),'referencia_general'),100);
  assert.equal(sum([...byGroup.values()].map(rr=>rr[0]),'n_grupo'),rows[0].n_validos_cruce);
  for(const rr of byGroup.values()) {
   assert.equal(rr.length,overview.get(c).length);
   assert.equal(sum(rr,'n_celda'),rr[0].n_grupo);
   close(sum(rr,'porcentaje'),100);
  }
  const inverse = new Map(pairs.get(c+'/'+g).map(r=>[JSON.stringify([r.categoria,r.grupo]),r]));
  for(const r of rows) {
   const rev = inverse.get(JSON.stringify([r.grupo,r.categoria]));
   assert.equal(r.n_celda,rev.n_celda);
   assert.equal(r.n_validos_cruce,rev.n_validos_cruce);
   assert.equal(r.n_excluidos+r.n_validos_cruce,5024);
   close(r.peso_celda,rev.peso_celda);
   close(r.porcentaje,100*r.peso_celda/r.peso_grupo);
   close(r.peso_grupo,sum(byGroup.get(r.grupo),'peso_celda'));
   close(r.referencia_general,100*sum(categories.get(r.categoria),'peso_celda')/sum(rows,'peso_celda'));
   assert.equal(r.porcentaje===0,r.n_celda===0);
  }
 }
 assert.equal(groups,350);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try {
  browser = await chromium.launch({channel:'msedge',headless:true});
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  const errors = [];
  page.on('pageerror',e=>errors.push(e.message));
  const url = 'http://127.0.0.1:'+server.address().port+'/preview-radar/#electorado';
  await page.goto(url);
  await page.locator('#social-content').waitFor();
  await page.locator('#social-overview-panel summary').click();
  for(const dim of dims) {
   await page.selectOption('#social-overview',dim);
   assert.deepEqual((await page.locator('#social-distribution .social-bar > span').allTextContents()).sort(), overview.get(dim).map(r=>pct(r.porcentaje)).sort());
   assert.equal(await page.locator('#social-distribution li').count(),overview.get(dim).length);
  }
  assert.equal(await page.locator('#social-topics, #social-advanced').count(),0);
  assert.match(await page.locator('#social-question').textContent(),/escala ideológica según la edad/);
  const legend = page.locator('#social-legend button');
  assert.equal(await legend.count(),10);
  await check('Edad','Ideologia');
  await legend.last().focus();
  await page.keyboard.press('Enter');
  assert.equal(await legend.last().getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#social-results li.social-highlight').count(),6);
  await page.keyboard.press('Space');
  assert.equal(await legend.last().getAttribute('aria-pressed'),'false');
  await page.locator('#social-invert').focus();
  await page.keyboard.press('Enter');
  await check('Ideologia','Edad');
  async function check(g,c) {
   assert.equal(await page.inputValue('#social-group'),g);
   assert.equal(await page.inputValue('#social-category'),c);
   const rows=pairs.get(g+'/'+c);
   const rendered = await page.locator('#social-results .social-card').evaluateAll(cards => cards.map(card => ({
    group: card.dataset.group,
    values: [...card.querySelectorAll('li')].map(li => [li.dataset.category, li.querySelector('.social-cell').textContent]),
    stack: [...card.querySelectorAll('.social-stack span')].map(span => [span.dataset.category, parseFloat(span.style.width)])
   })));
   const suppressed = r => ['Grupo muy pequeno','Celda muy pequena'].includes(r.nivel_informacion);
   const order = pairs => Object.fromEntries(pairs);
   assert.equal(rendered.length, new Set(rows.map(r=>r.grupo)).size);
   for (const [group,cells] of Map.groupBy(rows,r=>r.grupo)) {
    const actual = rendered.find(card=>card.group===group);
    assert.deepEqual(order(actual.values),order(cells.map(r=>[r.categoria,suppressed(r)?'Estimación oculta':pct(r.porcentaje)])));
    const visible = cells.some(suppressed) ? [] : cells.filter(r=>r.porcentaje>0);
    assert.equal(actual.stack.length,visible.length);
    for (const row of visible) assert.ok(Math.abs(order(actual.stack)[row.categoria]-row.porcentaje)<0.0001);
   }
  }
  for(const g of dims) for(const c of dims) if(g!==c) {
   if(await page.inputValue('#social-category')===g) await page.click('#social-invert');
   await page.selectOption('#social-group',g);
   await page.selectOption('#social-category',c);
   await check(g,c);
   await page.click('#social-invert');
   await check(c,g);
  }
  for(const width of [320,390,768,1280]) {
   await page.setViewportSize({width,height:844});
   if(await page.inputValue('#social-category')==='Situacion_laboral') await page.click('#social-invert');
   await page.selectOption('#social-group','Situacion_laboral');
   await page.selectOption('#social-category','Municipio');
   await check('Situacion_laboral','Municipio');
   assert.equal(await page.locator('#social').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  }
  await page.getByText('¿Cómo se calcula?',{exact:true}).click();
  assert.ok(await page.getByText('El porcentaje divide la suma de PESO',{exact:false}).isVisible());
  await page.setViewportSize({width:320,height:844});
  assert.ok(await page.locator('#social').evaluate(el=>el.scrollWidth<=el.clientWidth));
  for(const id of ['encuestas','mapa','partidos','electorado']) {
   await page.locator('#nav button').filter({hasText:({encuestas:'Encuestas',mapa:'Mapa',partidos:'Partidos',electorado:'Electorado'})[id]}).click();
   assert.ok(await page.locator('#'+id).isVisible());
  }
  assert.deepEqual(errors,[]);
  await page.goto(url.replace('#electorado','#social'));
  await page.reload();
  await page.locator('#social-answer').waitFor();
  const failed=await browser.newPage();
  await failed.route('**/electorado_social_3582.json',r=>r.fulfill({status:503}));
  await failed.goto(url);
  await failed.getByText('No se pudo cargar el perfil social.',{exact:false}).waitFor();
  await failed.locator('#el-top li').first().waitFor();
  console.log('56 cruces + 56 inversiones; 8 distribuciones; móvil; navegación y fallo de carga.');
 } finally {
  await browser?.close();
  server.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
