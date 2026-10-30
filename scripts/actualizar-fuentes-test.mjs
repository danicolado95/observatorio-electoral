import { update } from './update.mjs';
import { pathToFileURL } from 'node:url';
import { resolve, sep } from 'node:path';

const raizPruebas = pathToFileURL(
  resolve('data/pipeline-test') + sep
);

await update(raizPruebas);

console.log('Actualizador general: OK');
