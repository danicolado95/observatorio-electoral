# Análisis CIS 3582

Abre `analisis-cis.Rproj` en RStudio para que `here()` tome esta carpeta como raíz. Las rutas de los scripts son relativas a este proyecto, no a la raíz de la web.

## Estructura

- `scripts/00_actualizar_radiografias.R`: ejecución completa y validaciones.
- `scripts/01_importar_datos.R`: exploración de microdatos y etiquetas.
- `scripts/02_radiografia_partidos.R`: exploración de edad y calidad muestral.
- `scripts/03_funciones_radiografia.R`: motor reutilizable.
- `datos-originales/MD3582/3582.sav`: entrada local, nunca versionada.
- `resultados/radiografias_3582.json`: exportación reproducible versionada.

## Ejecutar

En la consola de RStudio, instala las dependencias solo si faltan:

```r
install.packages(c("haven", "here", "dplyr", "tidyr", "jsonlite"))
```

Desde el proyecto abierto, ejecuta:

```r
if (.Platform$OS.type == "windows") Sys.setlocale("LC_CTYPE", "English_United States.utf8")
source("scripts/00_actualizar_radiografias.R", encoding = "UTF-8")
```

El ajuste UTF-8 evita tildes dañadas en equipos con configuración regional incorrecta. No ejecutes `00` desde la raíz de la web. El script genera el JSON y comprueba distribuciones y medias; los scripts 01 y 02 son exploratorios y no hace falta ejecutarlos antes.

Tras superar las validaciones, revisa las diferencias del resultado. Para actualizar la copia que sirve la web:

```r
stopifnot(file.copy("resultados/radiografias_3582.json",
                   "../preview-radar/data/radiografias_3582.json", overwrite = TRUE))
```

Esta duplicación es deliberada: `resultados/` es la salida de R y `preview-radar/data/` es el recurso publicado. Deben coincidir. Repite después las pruebas web indicadas en `../preview-radar/RADIOGRAFIAS-CIS3582.md`.

## Datos y sesiones

Los microdatos, CSV originales y documentación de `datos-originales/` permanecen locales. Git ignora esa carpeta, archivos SAV, cachés y sesiones. El proyecto ya no restaura ni guarda automáticamente `.RData`; las sesiones antiguas permanecen físicamente intactas.

Validación del 5 de noviembre de 2026: R 4.6.2, 5.024 entrevistas, nueve variables; JSON regenerado idéntico en contenido al recuperado y al servido por la web. R avisa de una fecha no interpretable en los metadatos SAV (`22 001 26`); las validaciones del análisis pasan. Esto no sustituye una auditoría del cuestionario o del diseño muestral.