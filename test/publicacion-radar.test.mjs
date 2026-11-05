import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {difference} from '../scripts/radar-persistente.mjs';
test('Diferencia real independiente de orden de claves y registros; altas, pérdidas y campos modificados',()=>{
 const a=[{estudio_id:'a',resultados:{PP:30,PSOE:25}},{estudio_id:'b',resultados:{PP:31}}];
 assert.deepEqual(difference(a,[a[1],{resultados:{PSOE:25,PP:30},estudio_id:'a'}]),{added:[],removed:[],modified:[]});
 assert.deepEqual(difference(a,[{...a[0],resultados:{PP:29}},{estudio_id:'c'}]),{added:['c'],removed:['b'],modified:[{id:'a',fields:['resultados']}]});
});
test('Publicación: sin cambios es éxito sin commit; cambio válido publica; archivos ajenos y push rechazado fallan',()=>{
 const dir=mkdtempSync(join(tmpdir(),'radar-git-')),remote=join(dir,'remote.git'),repo=join(dir,'repo');mkdirSync(repo);
 const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
 git('init','--bare',remote);git('init','-b','radar-pruebas');git('config','user.name','Test');git('config','user.email','test@example.org');
 mkdirSync(join(repo,'data'));writeFileSync(join(repo,'data/radar.json'),'{}');git('add','.');git('commit','-m','base');git('remote','add','origin',remote);git('push','origin','radar-pruebas');
 const script=resolve('scripts/commit-radar.mjs'),env={...process.env};delete env.GH_TOKEN;
 const run=()=>spawnSync(process.execPath,[script],{cwd:repo,env,encoding:'utf8'});
 const before=git('rev-parse','HEAD');assert.equal(run().status,0);assert.equal(git('rev-parse','HEAD'),before);
 writeFileSync(join(repo,'data/radar.json'),'{"validado":true}');assert.equal(run().status,0);assert.notEqual(git('rev-parse','HEAD'),before);
 writeFileSync(join(repo,'otra.txt'),'ajeno');git('add','.');assert.notEqual(run().status,0);git('reset','--','otra.txt');
 git('remote','set-url','origin',join(dir,'no-existe'));writeFileSync(join(repo,'data/radar.json'),'{"validado":true,"new":1}');assert.notEqual(run().status,0);
});
