# Atlas Electoral

Plataforma interactiva de análisis y divulgación electoral.

## Dónde trabajar

Carpeta canónica local: `C:\Users\danie\OneDrive\Escritorio\GUIA ELECCIONES\observatorio-electoral`.
Abre esta carpeta en VS Code y GitHub Desktop. Las otras copias se conservan como referencia: no alternes entre ellas para editar.

Rama de trabajo actual: `integrar-radiografias-cis3582`. PR #8 en borrador, dirigida a `main`.
No trabajar directamente sobre `main`, ni fusionar la PR hasta revisar y autorizar su publicación.
`desarrollo` contiene otra línea de trabajo: no mezclarla automáticamente con esta rama.

## Carpetas

- `preview-radar/`: prototipo web activo, con Partidos, radar y mapa.
- `analisis-cis/`: proyecto RStudio, scripts y resultados reproducibles del CIS.
- `analisis-cis/datos-originales/`: microdatos locales; excluidos de Git.
- `docs/`: documentación del proyecto y recuperación.
- `js/`, `radar-pruebas/`, `test/` y HTML de la raíz: material anterior conservado. No mover sin revisar sus enlaces.
- `data/` y `scripts/` de la raíz: archivos locales previos sin seguimiento; pendientes de inventariar y revisar antes de incorporarlos.

## Retomar cada día

1. En GitHub Desktop, selecciona este repositorio y comprueba la ruta con Repository > Show in Explorer. Mantén la rama `integrar-radiografias-cis3582` mientras se revisa la PR #8.
2. Pulsa Fetch origin. Si hay cambios remotos, revisa los cambios locales antes de Pull. Si Desktop propone guardar cambios en stash, detente y revisa qué queda pendiente.
3. Para análisis, abre `analisis-cis/analisis-cis.Rproj`. Para web, abre la raíz en VS Code y usa Live Server sobre `preview-radar/index.html`; entra en `#partidos`. No abras el HTML directamente desde el Explorador.
4. Revisa las diferencias, comprueba la web y crea commits pequeños con descripción clara. No selecciones archivos desconocidos ni datos originales.
5. Usa Push origin para respaldar los commits. Continúa revisando la PR en borrador; fusionar es un paso separado que requiere decisión del propietario.

## R y pruebas

Consulta `analisis-cis/README.md` para regenerar el JSON y copiarlo a la web tras validarlo.
La metodología y pruebas web están en `preview-radar/RADIOGRAFIAS-CIS3582.md`.
El estado de recuperación, copias y limpieza pendiente está en `docs/RECUPERACION-2026-11-05.md`.

No borres stashes ni otras copias hasta comparar el trabajo y disponer de respaldo independiente.