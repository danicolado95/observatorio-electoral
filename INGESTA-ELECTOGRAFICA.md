> Informe histórico de trabajo. Estado actual: [CONSOLIDACION-RADAR.md](CONSOLIDACION-RADAR.md).

# Electográfica integrada · 2 noviembre 2026

Repo: C:/Users/danie/Documents/Codex/2026-11-01/referenced-chatgpt-conversation-this-is-an-7/work/observatorio-electoral
Rama desarrollo. Sin commits, push, publicación ni tareas activadas.

387 entradas únicas: 31 altas, 228 cruces concordantes, 128 apartadas. Estas últimas incluyen regionales, CIS, fechas incompletas, conflictos y formatos no reconocidos; no son 128 conflictos nacionales válidos.

Privadas 448 → 479; CIS 35 → 35; institutos privados 24 → 26. Mediana 21d, mínimo 3 institutos: PP/PSOE/VOX 1041 → 1049 días válidos; Sumar 1037 → 1044. Mayor hueco 35 → 35 días. Periodo 23/07/2023–02/11/2026, 1199 días; CIS OFF/ON en report.json.

Datos del gráfico local index.html?radar=staging: data/radar-desarrollo.json. Wikipedia de trabajo: data/pipeline-test/wikipedia/radar.json; fusión de trabajo: data/pipeline-test/electografica/radar.json. Evidencia e integración en data/pipeline-test/electografica/: before.json, radar.json, report.json, manifest.json, audit.json, quarantine.json y raw/. Los registros existentes conservan sus valores y reciben referencias adicionales concordantes. data/radar.json intacto.

Las altas extraen porcentajes del HTML de encuesta, separados del resultado electoral. Conservan instituto, medio, URL original, URL Electográfica, fecha explícita del título, campo, muestra nullable, ID Blogger y hashes. Fecha Blogger separada. Conflictos no sobrescriben registros. No se ha cotejado numéricamente cada publicación primaria: los valores se atribuyen a Electográfica y se enlazan los originales.

Comandos desde el repo:

```powershell
node scripts/importar-electografica.mjs
node --test test/*.test.mjs
python test/importar-wikipedia_test.py
python test/actualizar-wikipedia_test.py
./scripts/descargar-electografica.ps1
./scripts/actualizar-historico.ps1 -Python RUTA_PYTHON
```

El último conecta Wikipedia y Electográfica secuencialmente; requiere WIKIPEDIA_USER_AGENT con contacto real o -WikipediaHtml para archivo local. No activa programación. Descarga en páginas de 20 con pausa 1,2s y timeout 45s. Los errores detienen la ejecución. Conserva la revisión por registro existente de Wikipedia.

54 pruebas superadas: 36 JavaScript y 18 Python. Gráfico comprobado mediante DOM simulado: hover, selector Desde 23J y CIS. No se realizó inspección visual en navegador. Hay cuarentena pendiente y cobertura parcial; formatos desconocidos no entran automáticamente.

## Preparación controlada · 2 noviembre 2026

Los dos importadores Electográfica usan el día UTC actual por defecto. PowerShell
admite `-AsOf YYYY-MM-DD` y lo propaga a Node (`--as-of YYYY-MM-DD`), incluidos
el filtro, la validación y las estadísticas. El máximo del feed es exclusivo:
00:00 UTC del día siguiente, sin offset fijo de invierno/verano. El orquestador
`actualizar-historico.ps1 -AsOf` propaga ese corte a Electográfica; el importador
Wikipedia conserva su propia fecha Europe/Madrid.

El importador lee Wikipedia pero nunca escribe su radar. La fusión acumulada
sigue en `electografica/radar.json`, con referencias, IDs, hashes, deduplicación,
auditoría y cuarentena existentes. No hay cambios en los consumidores visuales:
los diagnósticos de Wikipedia siguen leyendo Wikipedia y la web lee el radar
de desarrollo consolidado. No se regenera ni publica ninguno de estos datos.

No hace falta migración en este checkout: Wikipedia contiene 483 registros,
cero altas con ID/ingestión Electográfica y cero referencias adicionales
Electográfica; no hay radar fusionado ni snapshot local. Si otro checkout tiene
Wikipedia ya fusionado, no ejecutar una reconstrucción sobre ese archivo:

1. Copiar íntegro `data/pipeline-test` a una carpeta de respaldo nueva fuera de
   ese árbol y guardar hashes SHA-256; conservar también cualquier radar fusionado.
2. Preparar en una copia aislada un Wikipedia puro desde una copia anterior
   verificada (por ejemplo `electografica/before.json`, solo tras verificar su
   procedencia), o desde el staging y las revisiones originales. No quitar
   registros automáticamente por nombre de instituto ni perder referencias.
3. Conservar el radar antiguo completo como `electografica/radar.json` en esa
   copia y ejecutar el importador sobre el snapshot archivado con su `--as-of`
   fijo. Comparar IDs, valores y referencias: toda alta anterior debe seguir en
   la fusión, sin duplicados. Si falta evidencia para reconstruir Wikipedia,
   detener la migración y conservar los originales.
4. Solo tras revisar, sustituir los archivos correspondientes con respaldo.
   Rollback: restaurar byte a byte los archivos desde la copia completa y
   comprobar sus hashes. No borrar el respaldo ni los originales archivados.

Verificación de este cambio: 48 pruebas JavaScript, 46 pasan y 2 se omiten por
falta de snapshot local; 15 + 3 pruebas Python pasan. Las 4 pruebas nuevas usan
fixtures sintéticos aislados y cubren fechas posteriores al antiguo corte,
UTC por defecto, fecha imposible, propagación en verano, separación byte a byte,
persistencia entre ejecuciones, cruces y deduplicación.
