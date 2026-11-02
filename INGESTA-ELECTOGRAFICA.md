> Informe histórico de trabajo. Estado actual: [CONSOLIDACION-RADAR.md](CONSOLIDACION-RADAR.md).

# Electográfica integrada · 2 noviembre 2026

Repo: C:/Users/danie/Documents/Codex/2026-11-01/referenced-chatgpt-conversation-this-is-an-7/work/observatorio-electoral
Rama desarrollo. Sin commits, push, publicación ni tareas activadas.

387 entradas únicas: 31 altas, 228 cruces concordantes, 128 apartadas. Estas últimas incluyen regionales, CIS, fechas incompletas, conflictos y formatos no reconocidos; no son 128 conflictos nacionales válidos.

Privadas 448 → 479; CIS 35 → 35; institutos privados 24 → 26. Mediana 21d, mínimo 3 institutos: PP/PSOE/VOX 1041 → 1049 días válidos; Sumar 1037 → 1044. Mayor hueco 35 → 35 días. Periodo 23/07/2023–02/11/2026, 1199 días; CIS OFF/ON en report.json.

Datos del gráfico local index.html?radar=staging: data/pipeline-test/wikipedia/radar.json. Evidencia e integración en data/pipeline-test/electografica/: before.json, radar.json, report.json, manifest.json, audit.json, quarantine.json y raw/. Los registros existentes conservan sus valores y reciben referencias adicionales concordantes. data/radar.json intacto.

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
