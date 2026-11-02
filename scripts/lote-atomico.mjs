import * as fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

// Prepara todos los bytes antes de promover. Ante fallo de E/S recupera el lote
// anterior; radar.json debe ir al final. No es una transacción ante corte eléctrico.
export async function promoverLote(dir, archivos, io = fs) {
  const preparados = [], aplicados = [];
  try {
    for (const [nombre, valor] of Object.entries(archivos)) {
      const target = new URL(nombre, dir), tmp = new URL(nombre+'.'+randomUUID()+'.tmp', dir);
      let anterior = null;
      try {anterior = await io.readFile(target);} catch (e) {if (e.code !== 'ENOENT') throw e;}
      const item = {target, tmp, anterior};
      preparados.push(item);
      await io.writeFile(tmp, JSON.stringify(valor, null, 2)+'\n');
    }
    for (const item of preparados) {
      await io.rename(item.tmp, item.target);
      aplicados.push(item);
    }
  } catch (error) {
    const fallos = [error];
    for (const item of aplicados.reverse()) {
      try {
        if (item.anterior === null) await io.rm(item.target, {force: true});
        else {await io.writeFile(item.tmp, item.anterior); await io.rename(item.tmp, item.target);}
      } catch (e) {fallos.push(e);}
    }
    if (fallos.length > 1) throw new AggregateError(fallos, 'Falló la recuperación del lote: revisar archivos antes de continuar');
    throw error;
  } finally {
    await Promise.all(preparados.map(item => io.rm(item.tmp, {force: true})));
  }
}
