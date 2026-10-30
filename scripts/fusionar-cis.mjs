import { readFile, writeFile } from 'node:fs/promises';

const RUTA_HISTORICO = 'data/cis-historico.json';
const RUTA_SALIDA = 'data/cis-fusion-prueba.json';

export function fusionar(historico, nuevas) {
  const porId = new Map();

  for (const encuesta of historico) {
    const id = String(encuesta.estudio_id);

    if (porId.has(id)) {
      throw new Error(`Duplicado en histórico: ${id}`);
    }

    porId.set(id, encuesta);
  }

  for (const encuesta of nuevas) {
    const id = String(encuesta.estudio_id);

    if (porId.has(id)) {
      const anterior = porId.get(id);

      if (JSON.stringify(anterior.resultados) !==
          JSON.stringify(encuesta.resultados)) {
        throw new Error(
          `Resultados diferentes para el estudio ${id}: revisión necesaria`
        );
      }

      // El estudio ya existe: conservamos el registro original.
      continue;
    }

    porId.set(id, encuesta);
  }

  return [...porId.values()].sort((a, b) =>
    a.trabajo_campo_fin.localeCompare(b.trabajo_campo_fin)
  );
}

const ejecutarPruebas = process.argv[1]
  ?.replaceAll('\\', '/')
  .endsWith('/fusionar-cis.mjs');

if (ejecutarPruebas) {

const historico = JSON.parse(
  await readFile(RUTA_HISTORICO, 'utf8')
).encuestas;

const fusionadas = fusionar(historico, historico);

await writeFile(
  RUTA_SALIDA,
  JSON.stringify({ version: 1, encuestas: fusionadas }, null, 2),
  'utf8'
);

console.log('Encuestas originales:', historico.length);
console.log('Encuestas tras fusionar:', fusionadas.length);
console.log('IDs únicos:', new Set(fusionadas.map(e => e.estudio_id)).size);
console.log('Archivo de prueba:', RUTA_SALIDA);}
