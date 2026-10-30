import { mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const destino = 'data/pipeline-test/data';

await mkdir(destino, { recursive: true });

for (const nombre of [
  'cis-historico.json',
  'radar.json',
  'sources.json'
]) {
  await copyFile(
    join('data', nombre),
    join(destino, nombre)
  );
  console.log(`Copia preparada: ${nombre}`);
}

console.log('Entorno aislado preparado correctamente.');
