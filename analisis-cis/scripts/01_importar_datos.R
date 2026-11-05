# ATLAS ELECTORAL
# 01 - Importación de microdatos del CIS

library(haven)
library(here)

# Importar barómetro 3582
cis <- read_sav(
  here("datos-originales", "MD3582", "3582.sav")
)

# Comprobar dimensiones
dim(cis)

# Examinar primeras variables
names(cis)[1:30]

# Vista general
str(cis, list.len = 10)

# Obtener etiquetas descriptivas de las 223 variables
etiquetas <- sapply(
  cis,
  function(x) {
    etiqueta <- attr(x, "label")
    if (is.null(etiqueta)) NA_character_ else etiqueta
  }
)

# Crear un diccionario de variables
diccionario <- data.frame(
  variable = names(cis),
  descripcion = etiquetas,
  row.names = NULL
)

# Buscar variables relacionadas con el voto
electorales <- subset(
  diccionario,
  grepl(
    "vot|elecci|partido|abstenci",
    descripcion,
    ignore.case = TRUE
  )
)

# Mostrar resultados
print(electorales, row.names = FALSE)

# Ver etiquetas y códigos originales
attr(cis$INTENCIONG, "labels")

# Ver etiquetas y códigos recodificados
attr(cis$INTENCIONGR, "labels")

# Frecuencias de intención de voto recodificada
table(
  haven::as_factor(cis$INTENCIONGR),
  useNA = "ifany"
)

# Comparar respuestas originales y recodificadas
tabla_recodificacion <- table(
  Original = haven::as_factor(cis$INTENCIONG),
  Recodificada = haven::as_factor(cis$INTENCIONGR)
)

# Examinar específicamente Sumar y Frente Amplio
tabla_recodificacion[
  c("Sumar", "Frente Amplio"),
  ,
  drop = FALSE
]

# Buscar variables relacionadas con ponderación
subset(
  diccionario,
  grepl(
    "ponder|peso|factor|elevaci",
    paste(variable, descripcion),
    ignore.case = TRUE
  )
)

# Revisar los nombres de las últimas variables
tail(names(cis), 35)

# ATLAS ELECTORAL
# Comprobaciones previas al análisis

# 1. Resumen de las edades
summary(as.numeric(cis$EDAD))

# 2. Comprobar los pesos
summary(as.numeric(cis$PESO))

# 3. Detectar pesos ausentes o no válidos
sum(
  is.na(cis$PESO) | as.numeric(cis$PESO) <= 0
)

# 4. Comprobar etiquetas especiales de EDAD
attr(cis$EDAD, "labels")

# 5. Verificar la suma de los pesos
sum(as.numeric(cis$PESO), na.rm = TRUE)
