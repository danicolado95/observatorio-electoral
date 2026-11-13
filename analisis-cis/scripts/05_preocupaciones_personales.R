# ==========================================
# 05. PREOCUPACIONES PERSONALES
# Paso 1: comprobar equivalencia de codigos
# ==========================================

library(haven)
library(here)
library(dplyr)

cis <- read_sav(
  here("datos-originales", "MD3582", "3582.sav")
)

# Etiquetas originales de ambas preguntas
etiquetas_espana <- attr(
  cis$PESPANNA1, "labels"
)

etiquetas_personales <- attr(
  cis$PPERSONAL1, "labels"
)

# Construir diccionarios
dic_espana <- data.frame(
  codigo = as.numeric(etiquetas_espana),
  etiqueta_espana = names(etiquetas_espana)
)

dic_personales <- data.frame(
  codigo = as.numeric(etiquetas_personales),
  etiqueta_personal = names(etiquetas_personales)
)

# Comparar categorias
comparacion_codigos <- full_join(
  dic_espana,
  dic_personales,
  by = "codigo"
) %>%
  mutate(
    coinciden = !is.na(etiqueta_espana) &
      !is.na(etiqueta_personal) &
      etiqueta_espana == etiqueta_personal
  )

cat("\n=== COMPROBACION DE CODIGOS ===\n")
cat("Categorias España:", nrow(dic_espana), "\n")
cat("Categorias personales:", nrow(dic_personales), "\n")
cat(
  "Codigos con etiquetas identicas:",
  sum(comparacion_codigos$coinciden),
  "\n"
)

cat("\n=== DIFERENCIAS ENCONTRADAS ===\n")

print(
  as.data.frame(
    comparacion_codigos %>%
      filter(!coinciden)
  ),
  row.names = FALSE
)


# ==========================================
# PASO 2. RANKING DE PREOCUPACIONES PERSONALES
# ==========================================

# Tres respuestas posibles por entrevistado
variables_personales <- c(
  "PPERSONAL1",
  "PPERSONAL2",
  "PPERSONAL3"
)

problemas_personales <- sapply(
  variables_personales,
  function(v) as.numeric(cis[[v]])
)

problemas_espana <- sapply(
  c("PESPANNA1", "PESPANNA2", "PESPANNA3"),
  function(v) as.numeric(cis[[v]])
)

pesos <- as.numeric(cis$PESO)

stopifnot(
  nrow(problemas_personales) == nrow(cis),
  nrow(problemas_espana) == nrow(cis),
  all(is.finite(pesos)),
  all(pesos > 0)
)

# Catálogo completo: problemas observados
# en cualquiera de las dos preguntas
codigos_observados <- sort(unique(c(
  as.numeric(problemas_espana),
  as.numeric(problemas_personales)
)))

codigos_observados <- codigos_observados[
  !is.na(codigos_observados) &
    !codigos_observados %in% c(996, 997, 998, 999)
]

# Etiquetas originales verificadas
etiquetas <- attr(cis$PESPANNA1, "labels")

nombres <- names(etiquetas)[
  match(codigos_observados, as.numeric(etiquetas))
]

stopifnot(!anyNA(nombres))

# Calcular el porcentaje de personas que
# mencionan cada problema en cada pregunta
ranking_comparado <- data.frame(
  codigo = codigos_observados,
  problema = nombres
) %>%
  rowwise() %>%
  mutate(
    menciones_espana = sum(
      rowSums(problemas_espana == codigo, na.rm = TRUE) > 0
    ),
    menciones_personales = sum(
      rowSums(problemas_personales == codigo, na.rm = TRUE) > 0
    ),
    porcentaje_espana = 100 * sum(
      pesos[rowSums(problemas_espana == codigo, na.rm = TRUE) > 0]
    ) / sum(pesos),
    porcentaje_personal = 100 * sum(
      pesos[rowSums(problemas_personales == codigo, na.rm = TRUE) > 0]
    ) / sum(pesos)
  ) %>%
  ungroup() %>%
  mutate(
    diferencia_pp = porcentaje_espana - porcentaje_personal
  ) %>%
  arrange(desc(porcentaje_personal))

stopifnot(
  all(is.finite(ranking_comparado$porcentaje_personal)),
  all(ranking_comparado$porcentaje_personal >= 0),
  all(ranking_comparado$porcentaje_personal <= 100)
)

cat("\n=== TOP 15 PROBLEMAS PERSONALES ===\n")

ranking_comparado %>%
  slice_head(n = 15) %>%
  transmute(
    problema,
    espana = round(porcentaje_espana, 1),
    personal = round(porcentaje_personal, 1),
    diferencia_pp = round(diferencia_pp, 1),
    n_personal = menciones_personales
  ) %>%
  as.data.frame() %>%
  print(row.names = FALSE)


# ==========================================
# PASO 3. SOLAPAMIENTO DE PREOCUPACIONES
# ==========================================

analizar_solapamiento <- function(codigo, nombre) {
  
  nacional <- rowSums(
    problemas_espana == codigo,
    na.rm = TRUE
  ) > 0
  
  personal <- rowSums(
    problemas_personales == codigo,
    na.rm = TRUE
  ) > 0
  
  # Cuatro situaciones mutuamente excluyentes
  situaciones <- c(
    "En ambas preguntas",
    "Solo como problema de España",
    "Solo como problema personal",
    "En ninguna"
  )
  
  condiciones <- list(
    nacional & personal,
    nacional & !personal,
    !nacional & personal,
    !nacional & !personal
  )
  
  resultado <- data.frame(
    problema = nombre,
    situacion = situaciones,
    porcentaje = vapply(
      condiciones,
      function(x) 100 * sum(pesos[x]) / sum(pesos),
      numeric(1)
    ),
    n = vapply(
      condiciones,
      function(x) sum(x),
      integer(1)
    )
  )
  
  stopifnot(
    sum(resultado$n) == nrow(cis),
    abs(sum(resultado$porcentaje) - 100) < 1e-8
  )
  
  resultado
}

solapamientos <- dplyr::bind_rows(
  analizar_solapamiento(7, "Vivienda"),
  analizar_solapamiento(8, "Economía"),
  analizar_solapamiento(6, "Sanidad"),
  analizar_solapamiento(18, "Inmigración")
)

cat("\n=== SOLAPAMIENTO DE PREOCUPACIONES ===\n")

solapamientos %>%
  mutate(porcentaje = round(porcentaje, 1)) %>%
  as.data.frame() %>%
  print(row.names = FALSE)



# ==========================================
# PASO 4. SOLAPAMIENTO DE TODOS LOS PROBLEMAS
# ==========================================

solapamientos_completos <- dplyr::bind_rows(
  lapply(seq_along(codigos_observados), function(i) {
    analizar_solapamiento(
      codigos_observados[i],
      nombres[i]
    )
  })
)

# Validar las cuatro situaciones por problema
validacion_solapamientos <- solapamientos_completos %>%
  group_by(problema) %>%
  summarise(
    total_n = sum(n),
    total_porcentaje = sum(porcentaje),
    .groups = "drop"
  )

stopifnot(
  nrow(solapamientos_completos) ==
    4 * length(codigos_observados),
  all(validacion_solapamientos$total_n == nrow(cis)),
  all(abs(
    validacion_solapamientos$total_porcentaje - 100
  ) < 1e-8)
)

cat("\nSOLAPAMIENTOS COMPLETOS VALIDADOS\n")
cat(
  "Problemas:",
  length(codigos_observados),
  "\n"
)
cat(
  "Resultados:",
  nrow(solapamientos_completos),
  "\n"
)

# Mostrar las mayores diferencias entre
# menciones nacionales y personales
cat("\n=== MAYORES DIFERENCIAS ===\n")

ranking_comparado %>%
  filter(
    menciones_espana >= 30,
    menciones_personales >= 30
  ) %>%
  arrange(desc(abs(diferencia_pp))) %>%
  slice_head(n = 12) %>%
  transmute(
    problema,
    espana = round(porcentaje_espana, 1),
    personal = round(porcentaje_personal, 1),
    diferencia_pp = round(diferencia_pp, 1)
  ) %>%
  as.data.frame() %>%
  print(row.names = FALSE)


# ==========================================
# PASO 5. EXPORTAR COMPARACION A JSON
# ==========================================

library(jsonlite)

# Verificaciones previas
stopifnot(
  length(codigos_observados) == 72,
  nrow(ranking_comparado) == 72,
  nrow(solapamientos_completos) == 288,
  all(is.finite(ranking_comparado$porcentaje_espana)),
  all(is.finite(ranking_comparado$porcentaje_personal))
)

# Estructura del archivo
salida_personales <- list(
  metadata = list(
    fuente = "CIS",
    estudio = 3582,
    entrevistas = nrow(cis),
    ponderacion = "PESO",
    pregunta_nacional = c(
      "PESPANNA1", "PESPANNA2", "PESPANNA3"
    ),
    pregunta_personal = c(
      "PPERSONAL1", "PPERSONAL2", "PPERSONAL3"
    ),
    descripcion = paste(
      "Comparacion de problemas nacionales y personales.",
      "Cada persona se cuenta una vez por problema y pregunta.",
      "Los porcentajes son ponderados y las preguntas",
      "permiten respuestas multiples."
    )
  ),
  ranking_comparado = ranking_comparado,
  solapamientos = solapamientos_completos
)

# Ruta de salida
ruta_personales <- here::here(
  "resultados",
  "electorado_personales_3582.json"
)

dir.create(
  dirname(ruta_personales),
  recursive = TRUE,
  showWarnings = FALSE
)

# Exportacion
jsonlite::write_json(
  salida_personales,
  path = ruta_personales,
  pretty = TRUE,
  auto_unbox = TRUE,
  dataframe = "rows",
  na = "null",
  digits = NA
)

# Lectura de comprobacion
verificacion_personales <- jsonlite::read_json(
  ruta_personales,
  simplifyVector = TRUE
)

stopifnot(
  nrow(verificacion_personales$ranking_comparado) == 72,
  nrow(verificacion_personales$solapamientos) == 288
)

cat("\nJSON PERSONAL VALIDADO\n")
cat("Temas:", nrow(verificacion_personales$ranking_comparado), "\n")
cat("Solapamientos:", nrow(verificacion_personales$solapamientos), "\n")
cat("Archivo:", ruta_personales, "\n")

