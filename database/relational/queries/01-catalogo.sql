-- $1: dificultad opcional, $2: límite, $3: desplazamiento.
SELECT id_simulacion, titulo, descripcion, dificultad, duracion_estimada
FROM simulacion
WHERE estado = 'PUBLICADA' AND ($1::text IS NULL OR dificultad = $1)
ORDER BY dificultad, id_simulacion
LIMIT $2 OFFSET $3;
