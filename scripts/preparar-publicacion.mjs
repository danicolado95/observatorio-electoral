import { mkdir, copyFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

const origen = 'data/pipeline-test/data';
const destino = 'data/pipeline-test/publicacion';

const archivos = [
  ['cis-historico.json', 'cis-historico.json'],
  ['radar-sincronizado.json', 'radar.json']
];

// Primero debe haber terminado correctamente la validación.
// Este script solo prepara copias; no valida por sí mismo.
await rm(destino, { recursive: true, force: true });
await mkdir(destino, { recursive: true });

for (const [entrada, salida] of archivos) {
  await copyFile(
    join(origen, entrada),
    join(destino, salida)
  );

  console.log(`Preparado: ${salida}`);
}

console.log('PUBLICACIÓN PREPARADA EN ENTORNO AISLADO');
