import { readFileSync } from 'node:fs';

const carpeta = 'data/pipeline-test/data';

const radar = JSON.parse(
  readFileSync(`${carpeta}/radar-sincronizado.json`, 'utf8')
);

const historico = JSON.parse(
  readFileSync(`${carpeta}/cis-historico.json`, 'utf8')
);

if (!Array.isArray(radar.encuestas) ||
    !Array.isArray(historico.encuestas)) {
  throw new Error('VALIDACIÓN FALLIDA: estructura incorrecta');
}

const cis = radar.encuestas.filter(e => e.instituto === 'CIS');

const idsRadar = cis.map(e => String(e.estudio_id));
const idsHistorico = historico.encuestas.map(e => String(e.estudio_id));

if (
  idsRadar.length === 0 ||
  new Set(idsRadar).size !== idsRadar.length ||
  new Set(idsHistorico).size !== idsHistorico.length ||
  idsRadar.length !== idsHistorico.length ||
  idsHistorico.some(id => !idsRadar.includes(id))
) {
  throw new Error('VALIDACIÓN FALLIDA: histórico CIS y radar no coinciden');
}

console.log(`VALIDACIÓN SUPERADA: ${cis.length} estudios CIS sincronizados`);
