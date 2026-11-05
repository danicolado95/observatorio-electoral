'use strict';
// Run with Playwright installed; BROWSER_CHANNEL defaults to the system Edge.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {execFileSync} = require('node:child_process');
const root=path.resolve(__dirname,'../..');
const base='630571b';
const original=execFileSync('git',['show',base+':preview-radar/index.html'],{cwd:root,encoding:'utf8'});
const current=fs.readFileSync(path.join(root,'preview-radar/index.html'),'utf8');
for(const id of ['inicio','encuestas','mapa','electorado','transferencias','abstencion']) {
 const re=new RegExp('<section[^>]+id="'+id+'"[\\s\\S]*?</section>');
 assert.ok(current.match(re) && original.match(re), id+' section must exist');
 assert.equal(current.match(re)?.[0].replace(/\r\n/g,'\n'),original.match(re)?.[0].replace(/\r\n/g,'\n'),id+' section must remain unchanged');
}
for(const f of ['radar-portada.js','circunscripciones_2026.json','resultados_congreso_2023.json']) {
 const before=execFileSync('git',['show',base+':preview-radar/'+f],{cwd:root});
 assert.equal(fs.readFileSync(path.join(root,'preview-radar',f),'utf8').replace(/\r\n/g,'\n'),before.toString('utf8').replace(/\r\n/g,'\n'),f+' unchanged');
}
const data=JSON.parse(fs.readFileSync(path.join(root,'preview-radar/data/radiografias_3582.json'),'utf8'));
const fmt=new Intl.NumberFormat('es-ES',{maximumFractionDigits:2});
const dimensions=Object.keys(data).filter(k=>!['metadata','medias_ideologicas'].includes(k));
const parties=['PSOE','PP','VOX','SUMAR / Frente Amplio','Podemos','SALF'];
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const relative=pathname==='/'?'preview-radar/index.html':pathname.slice(1);
 const target=path.resolve(root,relative.endsWith('/')?relative+'index.html':relative);
 if(!target.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
 fs.readFile(target,(error,body)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',target.endsWith('.json')?'application/json':target.endsWith('.js')?'text/javascript':target.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(body);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/preview-radar/#partidos';
 let browser;
 try {
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>!document.getElementById('profile-party').disabled);
  assert.equal(await page.locator('#profile-party option').count(),6);
  assert.equal(await page.locator('#profile-compare option').count(),7);
  assert.equal(await page.locator('#profile-dim option').count(),9);
  let combinations=0,checkedRows=0,zeros=0;
  for(const dim of dimensions) {
   await page.selectOption('#profile-dim',dim);
   for(const party of parties) {
    await page.selectOption('#profile-party',party);
    for(const compare of ['Electorado general',...parties]) {
     await page.selectOption('#profile-compare',compare);
     for(const [selector,name] of [['#profile-a',party],['#profile-b',compare]]) {
      const expected=data[dim].filter(r=>r.partido===name);
      const actual=await page.locator(selector+' .profile-row').evaluateAll(rows=>rows.map(r=>({category:r.children[0].textContent,value:r.children[2].textContent,width:r.querySelector('.bar').style.width,title:r.title})));
      assert.equal(actual.length,expected.length);
      for(let i=0;i<expected.length;i++) {
       const r=expected[i];assert.equal(actual[i].category,r.categoria);assert.equal(actual[i].value,fmt.format(r.porcentaje)+' %');assert.equal(parseFloat(actual[i].width),r.porcentaje);assert.ok(actual[i].title.includes('n = '+fmt.format(r.n)));
       checkedRows++;if(r.porcentaje===0) zeros++;
      }
      const sample=await page.locator(selector==='#profile-a'?'#profile-sample-a':'#profile-sample-b').textContent();
      assert.ok(sample.includes('n = '+fmt.format(expected[0].n_total)));
      assert.ok(sample.includes('n efectivo = '+fmt.format(expected[0].n_efectivo)));
      assert.equal(sample.includes('Muestra reducida'),expected[0].n_total<100||expected[0].n_efectivo<100);
     }
     combinations++;
    }
   }
  }
  await page.selectOption('#profile-party','SALF');await page.selectOption('#profile-dim','ideologia');
  assert.ok((await page.locator('#profile-sample-a').textContent()).includes('Media ideológica (1–10): '+fmt.format(data.medias_ideologicas.find(r=>r.partido==='SALF').media)));
  await page.selectOption('#profile-party','SUMAR / Frente Amplio');
  if(process.env.QA_OUTPUT) {
   fs.mkdirSync(process.env.QA_OUTPUT,{recursive:true});
   await page.screenshot({path:path.join(process.env.QA_OUTPUT,'partidos-desktop.png'),fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No mobile horizontal overflow');
  if(process.env.QA_OUTPUT) await page.screenshot({path:path.join(process.env.QA_OUTPUT,'partidos-mobile.png'),fullPage:true});
  await page.locator('[data-go="transferencias"]').click();await page.selectOption('#transfer-from','PP');assert.ok((await page.locator('#transfer-sub').textContent()).includes('PP'));assert.equal(await page.locator('#flowgraph > div').count(),6);
  await page.locator('[data-go="abstencion"]').click();await page.locator('#turnout').fill('80');await page.locator('#turnout').dispatchEvent('input');assert.equal(await page.locator('#votes-out').textContent(),'80');
  await page.locator('[data-go="mapa"]').click();await page.waitForFunction(()=>document.getElementById('history-status').textContent.includes('cargados'));assert.equal(await page.locator('#province-select option').count(),52);await page.selectOption('#province-select','Madrid');assert.equal(await page.locator('#province-name').textContent(),'Madrid');
  await page.locator('[data-go="encuestas"]').click();
  await page.waitForFunction(()=>document.querySelector('#radar-grafico svg'));
  await page.selectOption('#radar-range','all');
  await page.locator('#radar-cis').check();
  assert.ok((await page.locator('#radar-status').textContent()).includes('CIS'));
  assert.ok(await page.locator('#radar-grafico svg circle').count()>0);
  assert.deepEqual(errors,[],'No uncaught page errors');
  for(const failure of ['404','invalid-json','missing-row','null-percentage']) {
   const p=await browser.newPage();
   await p.route('**/data/radiografias_3582.json',route=>{
    if(failure==='404') return route.fulfill({status:404,body:'Not found'});
    if(failure==='invalid-json') return route.fulfill({contentType:'application/json',body:'{'});
    const broken=structuredClone(data);
    if(failure==='missing-row') broken.edad.pop(); else broken.edad[0].porcentaje=null;
    return route.fulfill({contentType:'application/json',body:JSON.stringify(broken)});
   });
   await p.goto(url);await p.waitForFunction(()=>document.getElementById('profile-status').textContent.includes('No se pudieron'));
   assert.equal(await p.locator('#profile-a .profile-row').count(),0);
   assert.equal(await p.locator('#profile-b .profile-row').count(),0);
   for(const id of ['profile-party','profile-compare','profile-dim']) assert.equal(await p.locator('#'+id).isDisabled(),true);
   assert.equal(await p.locator('#transfer-from option').count(),5);
   await p.close();
  }
  console.log(JSON.stringify({combinations,checkedRows,zeroValuesChecked:zeros,mobileOverflow:false,unchangedSections:6,mapCircumscriptions:52,failureCases:4,uncaughtPageErrors:errors},null,2));
 } finally {if(browser) await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
