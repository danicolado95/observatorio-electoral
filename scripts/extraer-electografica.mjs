import {createHash} from 'node:crypto';
import {validate} from './update.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const text=s=>s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]*>/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&nbsp;/g,' ').replace(/&middot;/g,'·').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const iso=(d,m,y)=>`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
function field(s){let m=s.match(/(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?[-–](\d{1,2})\/(\d{1,2})\/(20\d{2})/);if(m)return [iso(m[1],m[2],m[3]||m[6]),iso(m[4],m[5],m[6])];m=s.match(/(\d{1,2})(?:[-–](\d{1,2}))?\/(\d{1,2})\/(20\d{2})/);if(m)return [iso(m[1],m[3],m[4]),iso(m[2]||m[1],m[3],m[4])];return null;}
const alias={'40dB.':'40dB','SigmaDos':'Sigma Dos','IMOP Insights':'IMOP','NC-Report':'NC Report','Celeste Tel':'Celeste-Tel','ElectoPanel':'EM-Analytics'};
const canon=s=>(alias[s]||s).normalize('NFD').replace(/[\u0300-\u036f.\s-]/g,'').toUpperCase();
const party=s=>({'SE ACABÓ':'SALF','EH BILDU':'EH_BILDU','EAJ-PNV':'PNV','CCa':'CC','NA+/UPN':'UPN','ALIANÇA.CAT':'ALIANCA_CAT','ADELANTE ANDALUCÍA':'ADELANTE_ANDALUCIA'})[s]||s;

export function extraerEntrada(e,asOf){
const problemas=[];
 const title=e.title.$t,html=e.content?.$t||'',plain=text(html),url=e.link.find(l=>l.rel==='alternate')?.href;

  if(!/ESPAÑA/.test(title))throw Error('Ámbito regional');
  if(/CIS|reestim|modelo|proyecci[oó]n/i.test(title))throw Error('CIS/modelo: se conserva canal CIS existente');
  const m=title.match(/Encuesta (.*?) (\d{2})\/(\d{2})\/(20\d{2})/);if(!m)throw Error('Identidad no reconocida');
  const pub=iso(m[2],m[3],m[4]);if(pub<'2023-07-23'||pub>asOf)throw Error('Fuera del periodo');
  let institute=alias[m[1]]||m[1];
  const ft=plain.match(/(?:Periodo de campo:|Fecha realización)\s*(.*?)(?:·|Método)/i);const dates=ft&&field(ft[1]);if(!dates)problemas.push({codigo:'CAMPO_INCOMPLETO',evidencia:'Campo incompleto: no se imputa'});
  const source=html.match(/Fuente:\s*(?:<[^>]*>\s*)*<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);if(!source)problemas.push({codigo:'ORIGINAL_AUSENTE',evidencia:'Falta enlace original'});
  const results={};
  const segment=html.split(/<!--\s*(?:ESCAÑOS|EVOLUCIÓN|IDV|INTENCIÓN DIRECTA)/i)[0];
  for(const c of segment.matchAll(/<!--\s*([^<>]+?)\s*-->([\s\S]*?)(?=<!--|$)/g)){
   const key=party(c[1].trim());if(!['PP','PSOE','VOX','SUMAR','PODEMOS','ERC','JUNTS','EH_BILDU','PNV','BNG','CC','UPN','PACMA','SALF','ALIANCA_CAT','ADELANTE_ANDALUCIA','FA','FV'].includes(key))continue;
   const v=c[2].match(/class="dato_encuesta"[^>]*>\s*(\d+(?:[,.]\d+)?)/)||c[2].match(/class="bar-fill-anim"\s+data-w="(\d+(?:\.\d+)?)/);
   if(v){const value=Number(v[1].replace(',','.'));if(Object.hasOwn(results,key)&&results[key]!==value)throw Error('Contradicción interna Electográfica: '+key);results[key]=value;}
  }
  if(!['PP','PSOE','VOX'].every(k=>Number.isFinite(results[k])))problemas.push({codigo:'PORCENTAJES_INCOMPLETOS',evidencia:'Formato de porcentajes no reconocido'});
  if(Object.values(results).some(v=>v<0||v>100)||Object.values(results).reduce((a,b)=>a+b,0)>100.5)problemas.push({codigo:'PORCENTAJES_INVALIDOS',evidencia:'Porcentajes fuera de rango o suma inválida'});
  if(problemas.length){const error=Error(problemas.map(p=>p.evidencia).join('; '));error.problemas=problemas;throw error;}
  const sample=plain.match(/Muestra:?\s*([\d.]+)(?:\s|·)/);
  const p=validate({instituto:institute,estudio_id:'electografica-'+hash(e.id.$t).slice(0,20),tipo:'estimacion_voto',ambito:'España',fecha_publicacion:pub,trabajo_campo_inicio:dates[0],trabajo_campo_fin:dates[1],fecha_fin_campo:dates[1],tipo_fecha:'publicacion',tamano_muestra:sample?Number(sample[1].replaceAll('.','')):null,resultados:results,fuente:source[1].replaceAll('&amp;','&'),medio:text(source[2]),url_electografica:url,ingestion:{source:'electografica',entry_id:e.id.$t,content_sha256:hash(html),blogger_published:e.published.$t,blogger_updated:e.updated.$t}}, {id:'electografica',allowHistoricalMetadata:true,allowedHosts:[new URL(source[1]).hostname]},asOf);

return p;
}
