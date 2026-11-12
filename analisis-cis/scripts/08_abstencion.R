# ATLAS ELECTORAL
# 08. ABSTENCIÓN | CIS 3582
# Ejecutar desde el proyecto analisis-cis, con haven, here y jsonlite.

here::i_am("scripts/08_abstencion.R")
ruta_cis <- here::here("datos-originales", "MD3582", "3582.sav")
if (!file.exists(ruta_cis)) stop("Falta el SAV original del CIS: ", ruta_cis)

# Conservar los códigos SPSS de no respuesta para auditar las exclusiones.
cis <- haven::read_sav(ruta_cis, user_na = TRUE)
mapa <- function(etiquetas, codigos) {
  data.frame(categoria = etiquetas, codigos = I(lapply(codigos, as.integer)))
}

social <- list(
  EDAD = mapa(c("18–24", "25–34", "35–44", "45–54", "55–64", "65+"),
              list(18:24, 25:34, 35:44, 45:54, 55:64, 65:998)),
  ESTUDIOS = mapa(c("Primaria o inferior", "Secundaria 1", "Secundaria 2",
                    "FP", "Superiores"), list(1:2, 3, 4, 5, 6)),
  ESCIDEOL = mapa(as.character(1:10), 1:10),
  INGRESHOG = mapa(c("Menos de 1.100 €", "De 1.100 a 1.800 €",
                     "De 1.801 a 2.700 €", "De 2.701 a 3.900 €",
                     "De 3.901 a 5.000 €", "Más de 5.000 €"), 6:1),
  CLASESUB = mapa(c("Alta y media alta", "Media-media", "Media-baja",
                    "Trabajadora/obrera", "Baja/pobre"), 1:5),
  SITLAB = mapa(c("Trabaja", "Pensionista", "Desempleo", "Estudiante",
                  "Trabajo doméstico no remunerado", "Otra"),
                list(1, 2:3, 4:5, 6, 7, 8)),
  ECOPER = mapa(c("Muy buena", "Buena", "Regular", "Mala", "Muy mala"), 1:5)
)

probabilidades <- mapa(as.character(0:10), 0:10)
participacion <- mapa(c("Votó en 2023", "No votó en 2023"), 1:2)
disposicion <- mapa(c("0–3", "4–6", "7–9", "10"), list(0:3, 4:6, 7:9, 10))
intencion <- mapa(
  c("Declara un partido", "Voto en blanco", "Voto nulo", "No votaría",
    "No sabe todavía", "No contesta"),
  list(c(1, 2, 3, 6, 8, 21, 28, 29, 101, 503, 901, 902, 1201, 1501, 1601,
         1602, 8995), 8996, 9977, 9997, 9998, 9999)
)
recuerdo <- mapa(c("PSOE", "PP", "VOX", "Sumar"), c(1, 2, 3, 21))
intencion_partidos <- mapa(c("PSOE", "PP", "VOX", "Sumar", "Podemos", "SALF"),
                          c(1, 2, 3, 21, 8, 28))

variables <- c("PESO", "PROBVOTO", "PARTICIPACIONG", "INTENCIONGR",
               "RECUERDO", names(social))
stopifnot(identical(dim(cis), c(5024L, 223L)), all(variables %in% names(cis)))
codigos <- lapply(cis[variables], as.numeric)
pesos <- codigos$PESO
stopifnot(all(is.finite(pesos) & pesos > 0))

casi_igual <- function(a, b) isTRUE(all.equal(a, b, tolerance = 1e-12))
base <- function(filas) {
  w <- pesos[filas]
  suma <- sum(w)
  suma2 <- sum(w^2)
  neff <- if (length(w)) suma^2 / suma2 else 0
  stopifnot(is.finite(suma2), neff <= length(w) + 1e-9)
  data.frame(n = length(w), suma_pesos = suma, suma_pesos2 = suma2,
             n_efectivo = neff)
}

agrupar <- function(x, mapa) {
  valores <- unlist(mapa$codigos)
  stopifnot(!anyDuplicated(valores))
  categorias <- rep(mapa$categoria, lengths(mapa$codigos))
  categorias[match(x, valores)]
}

resumir <- function(filas, grupo, categorias) {
  denominador <- base(filas)
  celdas <- do.call(rbind, lapply(categorias, function(categoria) {
    cbind(categoria = categoria, base(filas & grupo %in% categoria))
  }))
  stopifnot(sum(celdas$n) == denominador$n,
            casi_igual(sum(celdas$suma_pesos), denominador$suma_pesos),
            casi_igual(sum(celdas$suma_pesos2), denominador$suma_pesos2))
  celdas$porcentaje <- NA_real_
  if (denominador$n > 0) {
    celdas$porcentaje <- 100 * celdas$suma_pesos / denominador$suma_pesos
    stopifnot(casi_igual(sum(celdas$porcentaje), 100))
  }
  list(base = denominador, distribucion = celdas)
}

prob <- agrupar(codigos$PROBVOTO, probabilidades)
valida <- !is.na(prob)
part <- agrupar(codigos$PARTICIPACIONG, participacion)
disp <- agrupar(codigos$PROBVOTO, disposicion)
int <- agrupar(codigos$INTENCIONGR, intencion)
stopifnot(!anyNA(int))

perfil <- function(filas) {
  resultado <- resumir(filas & valida, prob, probabilidades$categoria)
  resultado$excluidos_probvoto <- base(filas & !valida)
  resultado$maxima <- base(filas & prob %in% "10")
  resultado$baja <- base(filas & prob %in% as.character(0:3))
  for (metrica in c("maxima", "baja")) {
    resultado[[metrica]]$porcentaje <- if (resultado$base$n > 0) {
      100 * resultado[[metrica]]$suma_pesos / resultado$base$suma_pesos
    } else NA_real_
  }
  resultado
}

perfiles <- function(grupo, categorias) {
  setNames(lapply(categorias, function(cat) perfil(grupo %in% cat)), categorias)
}
por_participacion <- perfiles(part, participacion$categoria)
general <- perfil(rep(TRUE, nrow(cis)))

auditar <- function(variable, grupo) {
  x <- codigos[[variable]]
  excluidos <- is.na(grupo)
  etiquetas <- attr(cis[[variable]], "labels")
  detalle <- lapply(sort(unique(x[excluidos]), na.last = TRUE), function(codigo) {
    filas <- if (is.na(codigo)) is.na(x) else x %in% codigo
    etiqueta <- names(etiquetas)[match(codigo, unname(etiquetas))]
    cbind(codigo = codigo, etiqueta = etiqueta, base(filas))
  })
  list(base_incluida = base(!excluidos), base_excluida = base(excluidos),
       codigos_excluidos = detalle)
}

explorador <- lapply(names(social), function(variable) {
  definicion <- social[[variable]]
  grupo <- agrupar(codigos[[variable]], definicion)
  perfiles(grupo, definicion$categoria)
})
names(explorador) <- names(social)

matriz <- setNames(lapply(participacion$categoria, function(cat) {
  filas <- part %in% cat & valida
  fila <- resumir(filas, disp, disposicion$categoria)
  fila$intencion_por_disposicion <- setNames(lapply(disposicion$categoria, function(tramo) {
    resumir(filas & disp %in% tramo, int, intencion$categoria)
  }), disposicion$categoria)
  fila
}), participacion$categoria)

rec <- agrupar(codigos$RECUERDO, recuerdo)
int_partido <- agrupar(codigos$INTENCIONGR, intencion_partidos)
electorados <- list(
  por_recuerdo = perfiles(rec, recuerdo$categoria),
  por_intencion = perfiles(int_partido, intencion_partidos$categoria)
)

# Referencias independientes de la revisión previa. Se redondean solo
# los valores comparados con referencias publicadas a esa precisión.
voto <- por_participacion[[1]]
abstencion <- por_participacion[[2]]
stopifnot(
  general$base$n == 5012L, abs(sum(pesos) - 5024) < 0.01,
  voto$base$n == 4372L, abstencion$base$n == 451L,
  round(voto$maxima$porcentaje, 1) == 85.8, round(voto$baja$porcentaje, 2) == 2.96,
  round(abstencion$maxima$porcentaje, 1) == 31.7,
  round(abstencion$baja$porcentaje, 1) == 45.8,
  identical(matriz[[1]]$distribucion$n, c(122L, 150L, 311L, 3789L)),
  identical(matriz[[2]]$distribucion$n, c(194L, 46L, 68L, 143L)),
  all(round(matriz[[2]]$distribucion$n_efectivo, 1) == c(92.7, 25.8, 31.4, 68.9))
)
for (fila in matriz) {
  stopifnot(casi_igual(sum(fila$distribucion$porcentaje), 100))
  for (detalle in fila$intencion_por_disposicion) {
    stopifnot(nrow(detalle$distribucion) == 6,
              casi_igual(sum(detalle$distribucion$porcentaje), 100))
  }
}

mapas <- c(list(PROBVOTO = probabilidades, PARTICIPACIONG = participacion,
                INTENCIONGR = intencion, RECUERDO = recuerdo,
                INTENCIONGR_electorados = intencion_partidos, disposicion = disposicion),
           social)
grupos <- c(list(PROBVOTO = prob, PARTICIPACIONG = part, INTENCIONGR = int,
                 RECUERDO = rec, INTENCIONGR_electorados = int_partido),
            lapply(names(social), function(v) agrupar(codigos[[v]], social[[v]])))
names(grupos)[6:length(grupos)] <- names(social)
exclusiones <- lapply(names(grupos), function(v) {
  original <- if (v == "INTENCIONGR_electorados") "INTENCIONGR" else v
  auditar(original, grupos[[v]])
})
names(exclusiones) <- names(grupos)
exclusiones$PESO <- list(base_incluida = base(rep(TRUE, nrow(cis))),
                        base_excluida = base(rep(FALSE, nrow(cis))),
                        codigos_excluidos = list())

# Los intervalos de edad son reglas, no un listado de edades observadas.
mapas$EDAD$codigos <- NULL
mapas$EDAD$desde <- c(18, 25, 35, 45, 55, 65)
mapas$EDAD$hasta <- c(24, 34, 44, 54, 64, 998)
etiquetas_cis <- lapply(cis[setdiff(variables, "PESO")], function(columna) {
  etiquetas <- attr(columna, "labels")
  list(pregunta = attr(columna, "label"),
       valores = data.frame(codigo = unname(etiquetas), etiqueta = names(etiquetas)))
})

salida <- list(
  metadatos = list(
    version = 1L, estudio = 3582L, fuente = "CIS, MD3582/3582.sav",
    md5 = unname(tools::md5sum(ruta_cis)),
    entrevistas = nrow(cis), variables = ncol(cis), peso = "PESO",
    base_original = exclusiones$PESO$base_incluida,
    unidad_porcentajes = "0–100",
    denominadores = list(
      distribucion_y_perfiles = "PROBVOTO 0–10 dentro de cada grupo.",
      matriz = "PROBVOTO 0–10 dentro de cada fila de PARTICIPACIONG.",
      desglose_intencion = "Cada celda PARTICIPACIONG × disposición.",
      electorados = "PROBVOTO 0–10 dentro de cada partido, por RECUERDO o por INTENCIONGR."
    ),
    definicion_n_efectivo = "(suma_pesos)^2 / suma_pesos2; 0 si n = 0",
    cautelas = c(
      "Resultados descriptivos y ponderados de respuestas declaradas.",
      "PROBVOTO mide disposición declarada; el voto futuro observado puede diferir.",
      "La participación de 2023 se basa en el recuerdo declarado.",
      "Kish resume la dispersión de pesos. La inferencia requeriría incorporar el diseño muestral.",
      "Interpretar con cautela las bases pequeñas, especialmente si n o n efectivo es inferior a 100."
    ),
    mapeo = mapas, etiquetas_cis = etiquetas_cis, exclusiones = exclusiones
  ),
  distribucion = list(general = general, por_participacion_2023 = por_participacion),
  explorador_social = explorador,
  matriz = matriz,
  electorados = electorados
)

# Serializar y comprobar antes de sustituir el resultado.
ruta_salida <- here::here("resultados", "abstencion_3582.json")
dir.create(dirname(ruta_salida), recursive = TRUE, showWarnings = FALSE)
json <- jsonlite::toJSON(salida, auto_unbox = TRUE, dataframe = "rows",
                         digits = NA, pretty = TRUE, na = "null")
stopifnot(jsonlite::validate(json))
writeLines(enc2utf8(json), ruta_salida, useBytes = TRUE)
message("Validación superada. JSON generado en ", ruta_salida)
