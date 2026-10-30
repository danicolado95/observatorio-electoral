import { readFile, writeFile } from 'node:fs/promises';

const cis = JSON.parse(
  await readFile('data/cis-historico.json', 'utf8')
);

const radar = JSON.parse(
  await readFile('data/radar.json', 'utf8')
);

if (!Array.isArray(cis.encuestas) || cis.encuestas.length === 0) {
  throw new Error(
    'Histórico CIS vacío o inválido: sincronización cancelada'
  );
}

const idsCIS = cis.encuestas.map(e => String(e.estudio_id));

if (new Set(idsCIS).size !== idsCIS.length) {
  throw new Error(
    'Histórico CIS con identificadores duplicados'
  );
}

if (cis.encuestas.some(e =>
  e.instituto !== 'CIS' ||
  !e.estudio_id ||
  !e.fuente ||
  !e.resultados ||
  !Object.keys(e.resultados).length
)) {
  throw new Error(
    'Histórico CIS con registros incompletos o incorrectos'
  );
}

const idsHistorico = new Set(
  cis.encuestas.map(e => String(e.estudio_id))
);

const estudiosCISAnteriores = radar.encuestas.filter(
  e => e.instituto === 'CIS'
);

const estudiosPerdidos = estudiosCISAnteriores.filter(
  e => !idsHistorico.has(String(e.estudio_id))
);

if (estudiosPerdidos.length > 0) {
  throw new Error(
    'Sincronización cancelada. Faltan estudios del CIS: ' +
    estudiosPerdidos.map(e => e.estudio_id).join(', ')
  );
}

const otrosInstitutos = radar.encuestas.filter(
  encuesta => encuesta.instituto !== 'CIS'
);

// Sustituimos únicamente los estudios del CIS.
const encuestas = [
  ...otrosInstitutos,
  ...cis.encuestas
].sort((a, b) =>
  a.trabajo_campo_fin.localeCompare(b.trabajo_campo_fin)
);

// Comprobamos identificadores únicos por instituto.
const claves = encuestas.map(
  encuesta => `${encuesta.instituto}:${encuesta.estudio_id}`
);

if (new Set(claves).size !== claves.length) {
  throw new Error('Hay encuestas duplicadas en el radar');
}

const resultado = {
  ...radar,
  encuestas,
  status: {
    ...radar.status,
    state: 'unconfigured',
    message: 'Histórico del CIS incorporado. Actualización general pendiente de configurar.'
  }
};

await writeFile(
  'data/radar-sincronizado-prueba.json',
  JSON.stringify(resultado, null, 2) + '\n',
  'utf8'
);

console.log('Encuestas CIS:', cis.encuestas.length);
console.log('Otras encuestadoras conservadas:', otrosInstitutos.length);
console.log('Total radar:', encuestas.length);
console.log('Estado:', resultado.status.state);
console.log('Archivo de prueba generado.');
