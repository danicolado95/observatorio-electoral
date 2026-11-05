
# ==================================================
# ATLAS ELECTORAL
# 00 - Actualizar radiografías del electorado
# Fuente: CIS - Estudio 3582
# ==================================================

# 1. LIBRERÍAS
library(haven)
library(here)
library(dplyr)
library(tidyr)
library(jsonlite)

# Cargar nuestro motor estadístico
source(here("scripts", "03_funciones_radiografia.R"))

# 2. IMPORTAR MICRODATOS
estudio <- 3582

cis <- haven::read_sav(
  here("datos-originales", "MD3582", "3582.sav")
)

# 3. VALIDACIONES DE ENTRADA

columnas_obligatorias <- c(
  # Intención de voto
  "INTENCIONGR",
  
  # Variables sociodemográficas
  "EDAD",
  "SEXO",
  "ESTUDIOS",
  
  # Ideología
  "ESCIDEOL",
  
  # Variables socioeconómicas
  "SITLAB",
  "INGRESHOG",
  "CLASESUB",
  "RELIGION",
  "TAMUNI",
  
  # Factor de ponderación
  "PESO"
)

# 4. PREPARAR VARIABLES
datos <- cis %>%
  transmute(
    partido = case_when(
      as.numeric(INTENCIONGR) == 1 ~ "PSOE",
      as.numeric(INTENCIONGR) == 2 ~ "PP",
      as.numeric(INTENCIONGR) == 3 ~ "VOX",
      as.numeric(INTENCIONGR) == 8 ~ "Podemos",
      as.numeric(INTENCIONGR) == 21 ~ "SUMAR / Frente Amplio",
      as.numeric(INTENCIONGR) == 28 ~ "SALF",
      TRUE ~ NA_character_
    ),
    
    peso = as.numeric(PESO),
    
    edad = as.numeric(EDAD),
    
    sexo = case_when(
      as.numeric(SEXO) == 1 ~ "Hombre",
      as.numeric(SEXO) == 2 ~ "Mujer",
      TRUE ~ NA_character_
    ),
    
    estudios = case_when(
      as.numeric(ESTUDIOS) == 1 ~ "Sin estudios",
      as.numeric(ESTUDIOS) == 2 ~ "Primaria",
      as.numeric(ESTUDIOS) == 3 ~ "Secundaria 1ª etapa",
      as.numeric(ESTUDIOS) == 4 ~ "Secundaria 2ª etapa",
      as.numeric(ESTUDIOS) == 5 ~ "Formación Profesional",
      as.numeric(ESTUDIOS) == 6 ~ "Estudios superiores",
      as.numeric(ESTUDIOS) == 7 ~ "Otros",
      TRUE ~ NA_character_
    ),
    
    ideologia = case_when(
      as.numeric(ESCIDEOL) %in% 1:10 ~
        as.character(as.numeric(ESCIDEOL)),
      TRUE ~ NA_character_
    ),
    
    # Situación laboral
    situacion_laboral = case_when(
      as.numeric(SITLAB) == 1 ~ "Trabaja",
      as.numeric(SITLAB) == 2 ~ "Jubilado/a",
      as.numeric(SITLAB) == 3 ~ "Pensionista sin empleo previo",
      as.numeric(SITLAB) == 4 ~ "En paro, trabajó antes",
      as.numeric(SITLAB) == 5 ~ "En paro, primer empleo",
      as.numeric(SITLAB) == 6 ~ "Estudiante",
      as.numeric(SITLAB) == 7 ~ "Trabajo doméstico no remunerado",
      as.numeric(SITLAB) == 8 ~ "Otra situación",
      TRUE ~ NA_character_
    ),
    
    # Ingresos netos del hogar
    ingresos_hogar = case_when(
      as.numeric(INGRESHOG) == 1 ~ "Más de 5.000 €",
      as.numeric(INGRESHOG) == 2 ~ "3.901-5.000 €",
      as.numeric(INGRESHOG) == 3 ~ "2.701-3.900 €",
      as.numeric(INGRESHOG) == 4 ~ "1.801-2.700 €",
      as.numeric(INGRESHOG) == 5 ~ "1.100-1.800 €",
      as.numeric(INGRESHOG) == 6 ~ "Menos de 1.100 €",
      TRUE ~ NA_character_
    ),
    
    # Clase social subjetiva
    clase_social = case_when(
      as.numeric(CLASESUB) == 1 ~ "Alta y media-alta",
      as.numeric(CLASESUB) == 2 ~ "Media-media",
      as.numeric(CLASESUB) == 3 ~ "Media-baja",
      as.numeric(CLASESUB) == 4 ~ "Trabajadora/obrera",
      as.numeric(CLASESUB) == 5 ~ "Baja/pobre",
      as.numeric(CLASESUB) == 6 ~ "Otras",
      TRUE ~ NA_character_
    ),
    
    # Religiosidad
    religion = case_when(
      as.numeric(RELIGION) == 1 ~ "Católico/a practicante",
      as.numeric(RELIGION) == 2 ~ "Católico/a no practicante",
      as.numeric(RELIGION) == 3 ~ "Otra religión",
      as.numeric(RELIGION) == 4 ~ "Agnóstico/a",
      as.numeric(RELIGION) == 5 ~ "Indiferente/no creyente",
      as.numeric(RELIGION) == 6 ~ "Ateo/a",
      TRUE ~ NA_character_
    ),
    
    # Tamaño de municipio
    tamano_municipio = case_when(
      as.numeric(TAMUNI) == 1 ~ "Hasta 2.000",
      as.numeric(TAMUNI) == 2 ~ "2.001-10.000",
      as.numeric(TAMUNI) == 3 ~ "10.001-50.000",
      as.numeric(TAMUNI) == 4 ~ "50.001-100.000",
      as.numeric(TAMUNI) == 5 ~ "100.001-400.000",
      as.numeric(TAMUNI) == 6 ~ "400.001-1.000.000",
      as.numeric(TAMUNI) == 7 ~ "Más de 1.000.000",
      TRUE ~ NA_character_
    )
    
  ) %>%
  mutate(
    grupo_edad = case_when(
      edad >= 18 & edad <= 24 ~ "18-24",
      edad >= 25 & edad <= 34 ~ "25-34",
      edad >= 35 & edad <= 44 ~ "35-44",
      edad >= 45 & edad <= 54 ~ "45-54",
      edad >= 55 & edad <= 64 ~ "55-64",
      edad >= 65 & edad <= 120 ~ "65+",
      TRUE ~ NA_character_
    )
  )

# 5. CÁLCULO DE RADIOGRAFÍAS

edad_resultados <- calcular_radiografia(
  datos, "grupo_edad",
  categorias = c(
    "18-24", "25-34", "35-44",
    "45-54", "55-64", "65+"
  )
)

sexo_resultados <- calcular_radiografia(
  datos, "sexo",
  categorias = c("Hombre", "Mujer")
)

estudios_resultados <- calcular_radiografia(
  datos, "estudios",
  categorias = c(
    "Sin estudios",
    "Primaria",
    "Secundaria 1ª etapa",
    "Secundaria 2ª etapa",
    "Formación Profesional",
    "Estudios superiores",
    "Otros"
  )
)

ideologia_resultados <- calcular_radiografia(
  datos, "ideologia",
  categorias = as.character(1:10)
)

medias_ideologicas <- calcular_media_ponderada(
  datos, "ideologia",
  minimo = 1,
  maximo = 10
)

# ==========================================
# RADIOGRAFÍAS SOCIOECONÓMICAS
# ==========================================

situacion_laboral_resultados <- calcular_radiografia(
  datos, "situacion_laboral",
  categorias = c(
    "Trabaja",
    "Jubilado/a",
    "Pensionista sin empleo previo",
    "En paro, trabajó antes",
    "En paro, primer empleo",
    "Estudiante",
    "Trabajo doméstico no remunerado",
    "Otra situación"
  )
)

ingresos_resultados <- calcular_radiografia(
  datos, "ingresos_hogar",
  categorias = c(
    "Menos de 1.100 €",
    "1.100-1.800 €",
    "1.801-2.700 €",
    "2.701-3.900 €",
    "3.901-5.000 €",
    "Más de 5.000 €"
  )
)

clase_resultados <- calcular_radiografia(
  datos, "clase_social",
  categorias = c(
    "Alta y media-alta",
    "Media-media",
    "Media-baja",
    "Trabajadora/obrera",
    "Baja/pobre",
    "Otras"
  )
)

religion_resultados <- calcular_radiografia(
  datos, "religion",
  categorias = c(
    "Católico/a practicante",
    "Católico/a no practicante",
    "Otra religión",
    "Agnóstico/a",
    "Indiferente/no creyente",
    "Ateo/a"
  )
)

municipio_resultados <- calcular_radiografia(
  datos, "tamano_municipio",
  categorias = c(
    "Hasta 2.000",
    "2.001-10.000",
    "10.001-50.000",
    "50.001-100.000",
    "100.001-400.000",
    "400.001-1.000.000",
    "Más de 1.000.000"
  )
)

# 6. VALIDACIÓN AUTOMÁTICA

validar_radiografia <- function(tabla, categorias) {
  
  control <- tabla %>%
    group_by(partido) %>%
    summarise(
      total = sum(porcentaje),
      n_categorias = n(),
      .groups = "drop"
    )
  
  stopifnot(
    nrow(control) == 7,
    all(abs(control$total - 100) <= 0.05),
    all(control$n_categorias == categorias),
    all(tabla$porcentaje >= 0),
    all(tabla$porcentaje <= 100)
  )
  
  invisible(TRUE)
}

validar_radiografia(edad_resultados, 6)
validar_radiografia(sexo_resultados, 2)
validar_radiografia(estudios_resultados, 7)
validar_radiografia(ideologia_resultados, 10)
validar_radiografia(situacion_laboral_resultados, 8)
validar_radiografia(ingresos_resultados, 6)
validar_radiografia(clase_resultados, 6)
validar_radiografia(religion_resultados, 6)
validar_radiografia(municipio_resultados, 7)

stopifnot(
  nrow(medias_ideologicas) == 7,
  all(medias_ideologicas$media >= 1),
  all(medias_ideologicas$media <= 10)
)

# 7. PREPARAR RESULTADOS PARA LA WEB

salida <- list(
  metadata = list(
    fuente = "CIS",
    estudio = estudio,
    universo = "Población representada por el estudio",
    criterio_partidos = "Intención directa de voto",
    variable_voto = "INTENCIONGR",
    ponderacion = "PESO",
    entrevistas = nrow(cis),
    nota = paste(
      "Porcentajes ponderados sobre respuestas válidas.",
      "Electorado general: conjunto de entrevistados.",
      "Los tamaños muestrales n son sin ponderar."
    )
  ),
  
  edad = edad_resultados,
  sexo = sexo_resultados,
  estudios = estudios_resultados,
  ideologia = ideologia_resultados,
  situacion_laboral = situacion_laboral_resultados,
  ingresos_hogar = ingresos_resultados,
  clase_social = clase_resultados,
  religion = religion_resultados,
  tamano_municipio = municipio_resultados,
  
  medias_ideologicas = medias_ideologicas
)

# 8. EXPORTAR JSON

dir.create(
  here("resultados"),
  showWarnings = FALSE,
  recursive = TRUE
)

jsonlite::write_json(
  salida,
  path = here("resultados", "radiografias_3582.json"),
  pretty = TRUE,
  auto_unbox = TRUE,
  dataframe = "rows",
  na = "null"
)

# 9. MENSAJE FINAL

cat("\n====================================\n")
cat("ATLAS ELECTORAL - CIS", estudio, "\n")
cat("====================================\n")
cat("Entrevistas:", nrow(cis), "\n")
cat("Partidos analizados: 6\n")
cat("Variables analizadas: 4\n")
cat("Validaciones: SUPERADAS\n")
cat("JSON generado correctamente.\n")
cat("Variables analizadas: 9\n")
