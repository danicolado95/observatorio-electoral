'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const server=require('../serve.cjs');
const root=path.resolve(__dirname,'../..');
const data=JSON.parse(fs.readFileSync(path.join(root,'analisis-cis/resultados/electorado_3582.json'),'utf8'));
const format=new Intl.NumberFormat('es-ES',{maximumFractionDigits:2});
const pct=v=>v>0&&v<0.005?'<0,01 %':format.format(v)+' %';
const dimensions=[...new Set(data.comparaciones.map(r=>r.dimension))];
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:${server.address().port}/index.html#electorado`;
  await page.goto(url);await page.waitForFunction(()=>!document.getElementById('el-content').hidden);
  assert.equal(await page.locator('#el-problem option').count(),69);
  assert.equal(await page.locator('#el-top button').count(),5);
  assert.deepEqual(await page.locator('#el-top strong').allTextContents(),data.ranking_nacional.slice(0,5).map(r=>pct(r.porcentaje)));
  let checked=0,suppressed=0,zeros=0,smallBases=0;
  for(const r of data.ranking_nacional){
   await page.selectOption('#el-problem',String(r.codigo));
   assert.ok((await page.locator('#el-national').textContent()).includes(pct(r.porcentaje)));
   for(const dim of dimensions){
    await page.selectOption('#el-dimension',dim);
    const expected=data.comparaciones.filter(v=>v.dimension===dim&&v.codigo===r.codigo);
    if(r.menciones<30){assert.equal(await page.locator('#el-rows li').count(),0);assert.equal(await page.locator('#el-plot').isVisible(),false);suppressed+=expected.length;continue;}
    const actual=await page.locator('#el-rows li').evaluateAll(rows=>rows.map(row=>({label:row.querySelector('.el-group').textContent,value:row.querySelector('.el-value').textContent,base:row.querySelector('.el-base').textContent,width:row.querySelector('.el-bar').style.width,ref:row.querySelector('.el-ref').style.left})));
    assert.equal(actual.length,expected.length);
    for(const v of expected){const a=actual.find(a=>a.label===v.grupo);assert.ok(a);assert.equal(a.value,pct(v.porcentaje));assert.ok(Math.abs(parseFloat(a.width)-v.porcentaje)<0.0001);assert.ok(Math.abs(parseFloat(a.ref)-r.porcentaje)<0.0001);assert.ok(a.base.includes('n = '+format.format(v.n)));assert.ok(a.base.includes('n efectivo = '+format.format(v.n_efectivo)));assert.ok(a.base.includes(format.format(v.menciones_grupo)+' menciones'));assert.equal(a.base.includes('Base pequeña'),v.n<100||v.n_efectivo<100);assert.equal(a.base.includes('Muy pocas menciones'),v.menciones_grupo>0&&v.menciones_grupo<5);if(v.menciones_grupo===0){assert.ok(a.base.includes('no dato ausente'));zeros++;}if(v.n_efectivo<100)smallBases++;checked++;}
   }
  }
  assert.equal(checked+suppressed,2553);
  await page.locator('#el-search').fill('educacion');assert.equal(await page.locator('#el-problem option').count(),1);assert.ok((await page.locator('#el-title').textContent()).includes('educación'));
  await page.locator('#el-search').fill('zzzz-no-existe');assert.equal(await page.locator('#el-detail').isVisible(),false);assert.equal(await page.locator('#el-problem').isDisabled(),true);
  await page.locator('#el-top button').first().click();assert.equal(await page.locator('#el-search').inputValue(),'');assert.equal(await page.locator('#el-problem option').count(),69);
  for(const dim of dimensions){await page.selectOption('#el-dimension',dim);if(dim==='Partido'){assert.equal(await page.locator('#el-vote').isVisible(),true);assert.ok((await page.locator('.el-bar').evaluateAll(b=>b.map(x=>x.style.background))).includes('rgb(36, 122, 195)'));}}
  for(const link of ['../analisis-cis/resultados/electorado_3582.json','../analisis-cis/scripts/04_preocupaciones_electorado.R','electorado.js','electorado.css'])assert.equal((await page.request.get(new URL(link,url).href)).status(),200);
  const out=process.env.QA_OUTPUT;if(out)fs.mkdirSync(out,{recursive:true});
  await page.selectOption('#el-dimension','Partido');
  await page.evaluate(()=>window.scrollTo(0,0));await page.mouse.move(0,0);if(out)await page.screenshot({path:path.join(out,'electorado-desktop.png'),fullPage:true});
  for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:900});for(const dim of dimensions){await page.selectOption('#el-dimension',dim);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow ${width}/${dim}`);}}
  await page.setViewportSize({width:390,height:844});await page.selectOption('#el-dimension','Partido');await page.evaluate(()=>window.scrollTo(0,0));await page.mouse.move(0,0);if(out)await page.screenshot({path:path.join(out,'electorado-mobile.png'),fullPage:true});
  for(const failure of ['404','invalid-json','missing-row','null-percentage','duplicate','unknown-group']){
   const p=await browser.newPage();await p.route('**/analisis-cis/resultados/electorado_3582.json',route=>{
    if(failure==='404')return route.fulfill({status:404,body:'Not found'});if(failure==='invalid-json')return route.fulfill({body:'{'});
    const d=structuredClone(data);if(failure==='missing-row')d.comparaciones.pop();if(failure==='null-percentage')d.comparaciones[0].porcentaje=null;if(failure==='duplicate')d.comparaciones[0]=d.comparaciones[1];if(failure==='unknown-group')d.comparaciones[0].grupo='Desconocido';return route.fulfill({contentType:'application/json',body:JSON.stringify(d)});
   });await p.goto(url);await p.waitForFunction(()=>document.getElementById('el-status').textContent.includes('No se pudieron'));assert.equal(await p.locator('#el-content').isVisible(),false);await p.close();
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({categories:69,comparisons:checked+suppressed,displayed:checked,suppressed,zeros,smallBases,failureCases:6,responsiveWidths:[320,390,768,1280],pageErrors:errors},null,2));
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
