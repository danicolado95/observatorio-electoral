# Recuperación y organización — 5 de noviembre de 2026

## Carpeta canónica

`C:\Users\danie\OneDrive\Escritorio\GUIA ELECCIONES\observatorio-electoral`

Rama de trabajo: `integrar-radiografias-cis3582`. PR: https://github.com/danicolado95/observatorio-electoral/pull/8 (borrador, sin fusionar).

## Recuperado

Siete archivos del stash `2d84e91524daa2977d65eeb38661d147055babeb`: cuatro scripts R, proyecto RStudio, .gitignore del análisis y JSON. Commit de recuperación: `d167f44`.

Se creó primero un ZIP mediante git archive, se extrajo y se compararon los siete objetos con sus identificadores Git. Todos coinciden. El stash sigue intacto.

ZIP independiente:
`C:\Users\danie\Documents\Codex\2026-11-05\referenced-chatgpt-conversation-this-is-an-4\outputs\respaldo-analisis-cis-stash-2d84e915.zip`

SHA-256 ZIP: `92FC0EFCEEE1A967EC86ED567D5A398BCC37D1988597A6DAE67EC8F0B18DE9E3`.
El ZIP contiene fuentes y resultados; no incluye microdatos. El SAV original permanece en `analisis-cis/datos-originales/MD3582/3582.sav` (1.681.194 bytes), junto a sus CSV y documentos originales. Conviene conservar además un respaldo privado de esos datos.

## Organización aplicada

README principal con ruta canónica, estructura, GitHub Desktop, Live Server y cinco pasos diarios. README del análisis con RStudio, dependencias, ejecución y actualización explícita del JSON web.

.gitignore de raíz excluye microdatos originales, SAV, dependencias, sesiones, cachés y archivos de entorno. Los scripts y JSON reproducibles sí se versionan. Ningún SAV ni archivo bajo datos-originales aparece en el índice Git.

RStudio ya no carga ni guarda automáticamente sesiones antiguas. No se han borrado .RData ni .Rhistory. No se han movido páginas antiguas, porque podrían tener enlaces relativos dependientes de su ubicación.

## Verificación

R 4.6.2 con haven, here, dplyr, tidyr y jsonlite. Análisis ejecutado en una copia aislada: 5.024 entrevistas, nueve variables, validaciones superadas. Tras fijar LC_CTYPE a UTF-8, el JSON generado coincide íntegramente en contenido con el recuperado. El JSON recuperado y el de la web coinciden también byte a byte: SHA-256 `D3FE73C02B834865B5DA84E25FA470C91DC4B98765AD69A838C51AC1A5751105`.

R muestra avisos de configuración regional inicial y de una fecha del SAV (`22 001 26`); no impiden los cálculos. No se ha auditado de nuevo la codificación del cuestionario ni el diseño muestral.

Playwright y Edge: 378 combinaciones, 4.872 filas, 221 apariciones de cero, cuatro casos de fallo, sin desbordamiento móvil ni excepciones JavaScript. Mapa: 52 circunscripciones y selección Madrid. Radar: gráfico, cambio de periodo y CIS. Transferencias y Abstención también comprobadas.

Se corrigió únicamente la comparación de saltos de línea CRLF/LF de las secciones HTML en la prueba, para que funcione en Windows. La web y sus datos no se modificaron.

## Copias y ramas conservadas

- Copia Work: `C:\Users\danie\Documents\Codex\2026-11-05\referenced-chatgpt-conversation-this-is-an-2\work\observatorio-electoral`. Limpia al inspeccionarla, en la misma rama y commit inicial `7982e7d`. Queda como referencia anterior; no editar allí en paralelo.
- `C:\Users\danie\atlas-main`: es un worktree del repositorio original, no un repositorio independiente. Está en main, limpio, commit `2c559c7`, 18 commits detrás de la referencia local origin/main. No se actualizó ni eliminó.
- `desarrollo`: `676f310`, coincide con su referencia local origin/desarrollo. No se mezcló.
- Se mantienen ambos stashes, incluido `!!GitHub_Desktop<desarrollo>` y el respaldo local anterior.
- `data/` y `scripts/` de raíz contienen material previo sin seguimiento. Se conservan sin añadir, mover ni ignorar en bloque; requieren revisión específica antes de integrarlos o eliminarlos.

## Pendiente y recomendaciones

Continuar solo desde la carpeta canónica. Revisar la PR #8 antes de decidir publicación. No cambiar de rama con trabajo pendiente sin entender el aviso de GitHub Desktop.

Una futura limpieza debe comparar las copias y archivos locales antes de autorizar eliminación. Para atlas-main debe usarse la gestión de worktrees de Git; no borrar su carpeta a mano. No eliminar los stashes hasta disponer de respaldo de todo su contenido: este ZIP solo cubre analisis-cis, no el resto de los stashes.

La guía diaria está en el README principal. La copia de pruebas y sus dependencias están fuera del repositorio, bajo work/ de la conversación de recuperación; no forman parte de la web ni se publican.