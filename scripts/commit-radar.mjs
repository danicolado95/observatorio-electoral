import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
assert.equal(git('branch','--show-current'),'radar-pruebas','Rama de publicación incorrecta');
git('add','--','data/radar.json');
const paths=git('diff','--cached','--name-only');
if(!paths){
 console.log('Sin cambios en el archivo validado: no se crea commit ni se hace push.');
}else{
 assert.equal(paths,'data/radar.json','El commit contiene archivos ajenos al radar');
 git('config','user.name','github-actions[bot]');
 git('config','user.email','41898282+github-actions[bot]@users.noreply.github.com');
 console.log(git('commit','-m','Actualizar histórico validado del radar de pruebas'));
 // La credencial va en el entorno del hijo, nunca en argumentos que Node
 // pueda imprimir si Git falla.
 const env={...process.env};
 if(process.env.GH_TOKEN)Object.assign(env,{GIT_CONFIG_COUNT:'1',
  GIT_CONFIG_KEY_0:'http.https://github.com/.extraheader',
  GIT_CONFIG_VALUE_0:'AUTHORIZATION: basic '+Buffer.from('x-access-token:'+process.env.GH_TOKEN).toString('base64')});
 // Un push rechazado sigue siendo un fallo; nunca se fuerza la rama.
 console.log(execFileSync('git',['push','origin','HEAD:refs/heads/radar-pruebas'],{encoding:'utf8',env}).trim());
}
