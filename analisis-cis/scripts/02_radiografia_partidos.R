
# ATLAS ELECTORAL
# 02 - Radiografía de los electorados
# Fuente: CIS, estudio 3582

library(haven)
library(dplyr)
library(tidyr)
library(here)

# Importar los datos de forma independiente
cis <- read_sav(
  here("datos-originales", "MD3582", "3582.sav")
)

# Preparar variables
datos <- cis %>%
  transmute(
    partido = case_when(
      as.numeric(INTENCIONGR) == 1  ~ "PSOE",
      as.numeric(INTENCIONGR) == 2  ~ "PP",
      as.numeric(INTENCIONGR) == 3  ~ "VOX",
      as.numeric(INTENCIONGR) == 21 ~ "SUMAR / Frente Amplio",
      as.numeric(INTENCIONGR) == 8  ~ "Podemos",
      as.numeric(INTENCIONGR) == 28 ~ "SALF",
      TRUE ~ NA_character_
    ),
    edad = as.numeric(EDAD),
    peso = as.numeric(PESO)
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

# Función reutilizable para calcular porcentajes
calcular_edad <- function(df) {
  df %>%
    filter(!is.na(grupo_edad)) %>%
    group_by(grupo_edad) %>%
    summarise(
      n = n(),
      peso_total = sum(peso),
      .groups = "drop"
    ) %>%
    mutate(
      porcentaje = round(
        100 * peso_total / sum(peso_total),
        2
      )
    )
}

# Radiografía por partido
edad_partidos <- datos %>%
  filter(!is.na(partido)) %>%
  group_by(partido) %>%
  group_modify(~ calcular_edad(.x)) %>%
  ungroup()

# Radiografía del conjunto de entrevistados
edad_general <- calcular_edad(datos) %>%
  mutate(partido = "Electorado general")

# Unir resultados
radiografia_edad <- bind_rows(
  edad_partidos,
  edad_general
)

# Mostrar resultados
print(radiografia_edad, n = Inf)

# Tamaño efectivo aproximado de la muestra
# Fórmula de Kish basada en la desigualdad de pesos

calidad_muestra <- datos %>%
  filter(!is.na(partido)) %>%
  group_by(partido) %>%
  summarise(
    n = n(),
    n_efectivo = round(
      sum(peso)^2 / sum(peso^2),
      1
    ),
    .groups = "drop"
  ) %>%
  arrange(n_efectivo)

print(calidad_muestra)

# Cargar nuestras funciones
library(tidyr)
source("scripts/03_funciones_radiografia.R")

# Calcular radiografía por edades
edad_test <- calcular_radiografia(
  datos,
  "grupo_edad"
)

# Mostrar resultados
print(edad_test, n = Inf)