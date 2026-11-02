# Radar canónico de desarrollo · 2 noviembre 2026

Esta nota prevalece sobre las cifras y estados provisionales de los informes históricos de ingesta. Rama: desarrollo. No requiere publicar Pages ni cambiar main.

## Abrir la versión guardada

Desde la raíz: node scripts/preview.cjs . 8784. Abrir http://127.0.0.1:8784/?radar=staging&v=20261102#encuestas en cualquier navegador. El servidor escucha solo en loopback y devuelve Cache-Control: no-store; los scripts llevan versión en su URL. No se necesita construir ni descargar datos para visualizarla.

El radar de desarrollo lee **data/radar-desarrollo.json**: instantánea congelada de 480 privadas y 35 CIS, idéntica byte a byte al radar local aceptado. SHA-256: 923e48b954a405aa893df2ba2a44f3331ee4140090e58e2c225a87fc81c64864. data/radar.json conserva el canal anterior. Las ingestas siguen escribiendo en data/pipeline-test, nunca actualizan automáticamente esta instantánea versionada.

## Divergencia resuelta

La interfaz revisada estaba en otra carpeta work (radar.js), fuera del repositorio; el navegador integrado la mostraba mientras el servidor consultado directamente devolvía el radar anterior. Se incorporó esa interfaz al repositorio: filtros principales arriba, Más partidos, CIS integrado y desactivado inicialmente, metodología plegable, meses y etiquetas finales con porcentaje. El máximo vertical se ajusta a las series seleccionadas: 40 % en la vista inicial, ampliable cuando los datos lo requieren. El nuevo puerto permite comprobar los archivos del repositorio sin depender de la vista anterior del navegador integrado.

Mediana diaria: ventana inclusiva [t−20,t], último estudio por instituto antes del filtro de partido, publicación no posterior al día, mínimo tres institutos; sin ponderación muestral. La línea conecta visualmente medianas válidas a través de huecos. No crea valores diarios: tooltip y teclado conservan «sin base suficiente» en esos días. Las etiquetas muestran la última mediana válida, que puede ser anterior a hoy. Las fichas enlazan las fuentes originales y las referencias adicionales de Electográfica.

## Datos, derechos y límites

La instantánea conserva atribución a Wikipedia contributors, revisión permanente, historial y CC BY-SA 4.0; la conversión, normalización y filtrado se indican en la interfaz. Los registros conservan fuente, evidencia, hashes y metodología. Los informes de ingesta documentan la procedencia secundaria y los cotejos primarios: no se afirma que cada porcentaje haya sido cotejado con el original. Cobertura parcial, modelos y conflictos en cuarentena. La autorización de reutilización de Electográfica consta en el registro local; no se publica correspondencia privada ni se amplía la aceptación a nuevas oleadas.

No se incorporan HTML/PDF descargados, feeds completos, capturas, OCR, ZIP, cachés, logs ni el workflow diario local pendiente. Las fixtures de test conservan solo datos estructurados y decisiones de auditoría necesarias para las regresiones. Los originales descargados y su archivo de evidencia siguen disponibles localmente fuera del seguimiento de Git.

## Validación y mantenimiento

node --test test/*.test.mjs; python test/importar-wikipedia_test.py; python test/actualizar-wikipedia_test.py.

Las pruebas DOM usan la instantánea versionada y comprueban los cuatro estados periodo/CIS, continuidad sin alterar nulls, puntos, etiquetas, meses, teclado y tooltips. Dos integraciones de Electográfica requieren el feed local archivado y se omiten cuando no está presente; la prueba Python de snapshot real también requiere su archivo local. Las pruebas que ejecutan PowerShell requieren pwsh. La visualización canónica y sus pruebas no dependen de esos archivos.

No se habilita ningún cron nuevo. El workflow radar-daily.yml ya existía en la rama y puede ejecutarse por su trigger push preexistente; conserva permisos de solo lectura y no publica Pages.
