-- $1: token, antes de leer el documento en MongoDB.
SELECT c.id_evidencia, e.titulo, e.fecha_generacion, u.nombre AS titular,
       c.fecha_expiracion IS NOT NULL AND c.fecha_expiracion <= now() AS vencido
FROM comparticion c
JOIN evidencia e USING (id_evidencia)
JOIN usuario u USING (id_usuario)
WHERE c.token = $1 AND c.estado = 'ACTIVA';
