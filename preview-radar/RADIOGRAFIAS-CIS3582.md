# Integración de radiografías CIS 3582

La sección `preview-radar/#partidos` consulta `./data/radiografias_3582.json`. El archivo procede del JSON local generado y validado en RStudio; no se han estimado, sustituido ni recalculado sus porcentajes. JavaScript solo valida el contrato, selecciona filas y presenta `porcentaje`, `n`, `n_total`, `n_efectivo` y la media ideológica exportada. La suma de porcentajes se comprueba como validación; no se usa para normalizar los datos.

## Alcance y plan aplicado

Base: commit `630571b` de main. Rama independiente: `integrar-radiografias-cis3582`.

1. Verificar acceso real al JSON y revisar el script maestro y el motor estadístico locales antes de editar.
2. Copiar el JSON a una ruta relativa estable, compatible con GitHub Pages bajo `/observatorio-electoral/preview-radar/`.
3. Aislar la carga de radiografías en `radiografias-cis.js`; preservar los datos de demostración que todavía utiliza Electorado y la inicialización del selector de Transferencias.
4. Mantener tarjetas, colores y gráficos de barras. Añadir etiquetas accesibles, notas de base y avisos de carga. El CSS nuevo queda limitado a `#partidos`, para acomodar categorías largas.
5. Probar datos reales, errores de carga, móvil y regresiones. Abrir un PR sin fusionar ni modificar main.

Se conservan seis opciones de partido (PSOE, PP, VOX, SUMAR / Frente Amplio, Podemos, SALF), nueve variables y siete opciones de comparación (los seis electorados más Electorado general). Se permite comparar un partido consigo mismo. El orden de categorías coincide con el exportado por R, incluida ideología 1–10; las filas con cero se muestran con `0 %`. Una categoría ausente produce un error de carga: nunca se interpreta como cero.

El HTML de Inicio, Encuestas, Mapa, Electorado, Transferencias y Abstención se conserva. El aviso general y el pie se corrigen para no afirmar que las nuevas radiografías son ficticias. No se modifican `radar-portada.js`, las geometrías, las fuentes del radar ni los JSON electorales del mapa.

## Procedencia y metodología comprobadas

Archivo aportado: `analisis-cis/resultados/radiografias_3582.json`. SHA-256 del original y de la copia de trabajo antes de normalización de finales de línea por Git: `D3FE73C02B834865B5DA84E25FA470C91DC4B98765AD69A838C51AC1A5751105`.

Los metadatos declaran estudio 3582, 5.024 entrevistas, intención directa de voto (`INTENCIONGR`) y ponderación `PESO`. Universo declarado: «Población representada por el estudio». No se presenta como censo electoral ni como estimación de voto.

Se leyeron, sin modificar, los scripts locales `00_actualizar_radiografias.R` y `03_funciones_radiografia.R`:

- El maestro asigna `INTENCIONGR=21` a `SUMAR / Frente Amplio` (1 PSOE, 2 PP, 3 VOX, 8 Podemos, 28 SALF). Esta comprobación acredita la codificación del productor R; no constituye una nueva auditoría del cuestionario o de los microdatos originales del CIS.
- El motor filtra respuestas válidas y pesos positivos finitos; el grupo general incluye todas las respuestas válidas, aunque la intención no sea uno de esos seis partidos.
- `n` es el recuento sin ponderar por categoría; `n_total` es la base válida de la variable, no necesariamente todas las entrevistas del estudio.
- El porcentaje se calcula en R con los pesos PESO. `n_efectivo` procede de `(sum(peso)^2)/sum(peso^2)`, redondeado en R; refleja la dispersión de los pesos, no todo el diseño muestral.
- En edad, SALF tiene n_total=63 y n_efectivo=37,4; Podemos, n_total=116 y n_efectivo=67,1. Los valores cambian al elegir otra variable (SALF en ideología: 61 y 39,1).

La interfaz avisa si n_total o n_efectivo es inferior a 100. Es un umbral editorial explícito de cautela, no una prueba de significación ni un intervalo de confianza. No se han vuelto a ejecutar los cálculos en R ni se ha auditado el fichero SAV. Se conserva íntegro el JSON recibido, incluidas las medias ideológicas.

## Comprobaciones funcionales locales

Ejecutadas el 5 de noviembre de 2026 con Playwright y Microsoft Edge, sirviendo la copia por HTTP local:

- 378 combinaciones: 6 partidos × 9 variables × 7 comparadores.
- 4.872 filas cotejadas en ambas tarjetas: categoría, orden, porcentaje visible, anchura de barra y n de categoría.
- 221 apariciones de valores cero verificadas durante el recorrido; se mantienen visibles.
- Bases válidas y efectivas cotejadas en cada combinación, con aviso de muestra reducida cuando corresponde; media ideológica de SALF contrastada con el JSON.
- Cuatro fallos inducidos solo durante las pruebas: HTTP 404, JSON ilegible, categoría ausente y porcentaje nulo. En todos ellos: mensaje de error, selectores desactivados, tarjetas vacías y Transferencias disponible. No se publican fixtures ficticios.
- Revisión visual de capturas a 1280 y 390 píxeles; móvil sin desbordamiento horizontal.
- Secciones ajenas y archivos del radar/mapa comparados con el commit base, ignorando únicamente finales de línea CRLF/LF.
- Mapa: carga del histórico, 52 opciones de circunscripción y cambio a Madrid. Transferencias: selección PP. Abstención: cambio de participación al 80 %.
- Radar: carga del SVG con encuestas, cambio del periodo a «Desde 23J» y activación del CIS.
- Sin excepciones JavaScript no controladas durante el recorrido correcto. Los fallos inducidos sí registran el error esperado en consola.

El mapa y el radar conservan dependencias externas existentes. La prueba local no sustituye una comprobación de la publicación real después de una futura fusión autorizada.

## Repetir las pruebas

Desde la raíz del repositorio, instalar Playwright en una carpeta temporal fuera del repositorio y exponerla mediante NODE_PATH. Ejemplo en PowerShell (Node.js y Microsoft Edge instalados):

```powershell
npm install --prefix ../qa playwright
$env:NODE_PATH = (Resolve-Path ../qa/node_modules).Path
node preview-radar/tests/radiografias.spec.cjs
```

El test inicia y cierra su propio servidor y navegador. `BROWSER_CHANNEL` permite elegir otro canal Chromium instalado; `QA_OUTPUT` permite guardar capturas. Para revisar manualmente, servir la raíz con cualquier servidor HTTP estático y abrir `/preview-radar/#partidos`; abrir directamente mediante `file://` no permite probar correctamente fetch.

Para una actualización futura, exportar y validar en R, revisar el contrato y el orden de categorías, sustituir el JSON en la misma ruta y repetir las pruebas. El cargador rechaza metadatos incompatibles, estructuras incompletas, valores nulos y bases incoherentes; no intenta reparar ni aproximar resultados.
