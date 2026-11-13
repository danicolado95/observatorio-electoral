const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const server = require('../serve.cjs');
const data = require('../../analisis-cis/resultados/electorado_social_3582.json');
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, a+' != '+b);
const closeWidth = (a,b) => assert.ok(Math.abs(a-b)<1e-4, a+' != '+b);
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
  const url = 'http://127.0.0.1:'+server.address().port+'/index.html#electorado';
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
  const age = page.locator('[data-group="45-54"]');
  assert.equal(await page.locator('#social-results .social-stack').count(),6);
  assert.equal(await age.locator('.social-stack [data-category="9"]').count(),1);
  assert.equal(await age.locator('.social-stack').count(),1);
  assert.equal(await page.locator('#social-results .social-partial, #social-results ul').count(),0);
  if (process.env.ATLAS_SCREENSHOT) {
   await page.setViewportSize({width:1280,height:900});
   await page.locator('#social-answer').screenshot({style:'header.top { position: static; }',path:process.env.ATLAS_SCREENSHOT});
  }

  await legend.last().focus();
  await page.keyboard.press('Enter');
  assert.equal(await legend.last().getAttribute('aria-pressed'),'true');
  await legend.first().click();
  assert.equal(await page.locator('#social-legend [aria-pressed="true"]').count(),2);
  await page.selectOption('#social-group','Sexo');
  await page.selectOption('#social-category','Edad');
  const first = page.locator('#social-results .social-stack button').first();
  await first.focus();
  const tooltip = first.locator('xpath=../..').locator('.social-detail');
  assert.ok(await tooltip.isVisible());
  assert.ok((await tooltip.boundingBox()).width < 160);
  assert.ok((await first.getAttribute('aria-label')).includes(await tooltip.textContent()));
  const relativeTop = async () => (await tooltip.boundingBox()).y - (await first.boundingBox()).y;
  const before = await relativeTop();
  await page.evaluate(() => window.scrollBy(0, 100));
  assert.equal(await relativeTop(),before);
  await page.keyboard.press('Escape');
  assert.equal(await tooltip.isVisible(),false);
  await first.hover();
  if (process.env.ATLAS_SCREENSHOT) {
   await page.locator('#social-answer').screenshot({style:'header.top { position: static; }',path:process.env.ATLAS_SCREENSHOT.replace('ideologia-edad','edad-sexo')});
  }
  assert.ok(await tooltip.isVisible());
  assert.ok((await tooltip.boundingBox()).width < 160);
  await page.selectOption('#social-category','Ideologia');
  await page.selectOption('#social-group','Edad');
  await page.selectOption('#social-mode','split');
  await legend.nth(1).click();
  await legend.nth(2).click();
  await legend.nth(3).click();
  await legend.last().click();
  await checkSplit('Edad','Ideologia');
  if (process.env.ATLAS_SCREENSHOT) {
   await page.setViewportSize({width:1280,height:900});
   await page.locator('#social-answer').screenshot({style:'header.top { position: static; }',path:process.env.ATLAS_SCREENSHOT.replace('.png','-seleccion.png')});
  }

  for (const index of [0, 2, 3, 4, 7]) await legend.nth(index).click();
  await checkSplit('Edad','Ideologia');
  for (const index of [0, 2, 3, 4, 7]) await legend.nth(index).click();

  await page.selectOption('#social-order','desc');
  await page.selectOption('#social-group','Sexo');
  await page.selectOption('#social-category','Edad');
  await legend.first().click();
  await checkSplit('Sexo','Edad');
  const sorted = await page.locator('#social-results .social-stack').evaluateAll(stacks =>
   stacks.map(stack=>parseFloat(stack.firstElementChild.style.width)));
  assert.equal(sorted.length,2);
  assert.deepEqual(sorted,[...sorted].sort((a,b)=>b-a));
  await page.selectOption('#social-category','Ideologia');
  await page.selectOption('#social-group','Edad');
  await page.getByText('Filtrar grupos',{exact:true}).click();
  await page.locator('#social-filters button').nth(1).click();
  assert.equal(await page.locator('[data-group="18-24"]').count(),0);
  await page.getByRole('button',{name:'Ver todos',exact:true}).click();
  assert.equal(await page.locator('[data-group="18-24"]').count(),1);
  await page.selectOption('#social-mode','full');
  await page.selectOption('#social-order','natural');
  await legend.first().focus();
  await page.keyboard.press('Space');
  assert.equal(await legend.first().getAttribute('aria-pressed'),'false');
  await page.locator('#social-invert').focus();
  await page.keyboard.press('Enter');
  await check('Ideologia','Edad');
  async function check(g,c) {
   assert.equal(await page.inputValue('#social-group'),g);
   assert.equal(await page.inputValue('#social-category'),c);
   const byGroup = Map.groupBy(pairs.get(g+'/'+c),r=>r.grupo);
   assert.equal(await page.locator('#social-results .social-card').count(),byGroup.size);
   for (const [group,cells] of byGroup) {
    const card = page.locator('#social-results [data-group='+JSON.stringify(group)+']');
    const segments = card.locator('.social-stack button');
    assert.equal(await segments.count(),cells.length);
    for (const row of cells) {
     const segment = segments.and(card.locator('[data-category='+JSON.stringify(row.categoria)+']'));
     closeWidth(await segment.evaluate(el=>parseFloat(el.style.width)),row.porcentaje);
     assert.ok((await segment.getAttribute('aria-label')).includes(pct(row.porcentaje)));
    }
   }
  }
  async function checkSplit(g,c) {
   const keys = await page.locator('#social-legend button').evaluateAll(buttons =>
    buttons.filter(button=>button.getAttribute('aria-pressed')==='true').map(button=>button.dataset.category));
   const byGroup = Map.groupBy(pairs.get(g+'/'+c),r=>r.grupo);
   for (const [group,cells] of byGroup) {
    const card = page.locator('#social-results [data-group='+JSON.stringify(group)+']');
    const widths = await card.locator('.social-stack button').evaluateAll(buttons =>
     buttons.map(button=>parseFloat(button.style.width)));
    const selected = cells.filter(row=>keys.includes(row.categoria));
    const rest = cells.filter(row=>!keys.includes(row.categoria));
    assert.equal(widths.length,2);
    closeWidth(widths[0],100*sum(selected,'peso_celda')/cells[0].peso_grupo);
    closeWidth(widths[1],100*sum(rest,'peso_celda')/cells[0].peso_grupo);
   }
  }
  for(const g of dims) for(const c of dims) if(g!==c) {
   if(await page.inputValue('#social-category')===g) await page.click('#social-invert');
   await page.selectOption('#social-group',g);
   await page.selectOption('#social-category',c);
   await check(g,c);
   const capture = {'Edad/Estudios':'estudios-edad','Estudios/Ingresos':'ingresos-estudios'}[g+'/'+c];
   if (capture && process.env.ATLAS_SCREENSHOT) {
    await page.locator('#social-answer').screenshot({style:'header.top { position: static; }',path:process.env.ATLAS_SCREENSHOT.replace('ideologia-edad',capture)});
   }
   if (!(await legend.first().getAttribute('aria-pressed') === 'true')) await legend.first().click();
   await page.selectOption('#social-mode','split');
   await checkSplit(g,c);
   await page.selectOption('#social-mode','full');
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
  await page.locator('#social-content').getByText('¿Cómo se calcula?',{exact:true}).click();
  assert.ok(await page.getByText('El porcentaje divide la suma de PESO',{exact:false}).isVisible());
  await page.setViewportSize({width:320,height:844});
  assert.ok(await page.locator('#social').evaluate(el=>el.scrollWidth<=el.clientWidth));
  for(const id of ['encuestas','mapa','partidos','electorado']) {
   await page.locator('#nav button').filter({hasText:({encuestas:'Encuestas',mapa:'Mapa',partidos:'Partidos',electorado:'Electorado'})[id]}).click();
   assert.ok(await page.locator('#'+id).isVisible());
  }
  const touch = await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await touch.goto(url.replace('#electorado','#social'));
  await touch.selectOption('#social-group','Sexo');
  await touch.selectOption('#social-category','Edad');
  const touchStack = touch.locator('#social-results .social-chart').first();
  await touchStack.locator('button').first().tap();
  assert.ok(await touchStack.locator('.social-detail').isVisible());
  assert.ok(await touch.locator('#social').evaluate(el=>el.scrollWidth<=el.clientWidth));
  if (process.env.ATLAS_SCREENSHOT) {
   await touch.locator('#social-answer').screenshot({style:'header.top { position: static; }',path:process.env.ATLAS_SCREENSHOT.replace('ideologia-edad','edad-sexo-movil')});
  }
  await touch.close();
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
