CREATE UNIQUE INDEX uq_usuario_correo ON usuario (lower(correo));
CREATE INDEX ix_simulacion_catalogo ON simulacion (estado, dificultad, id_simulacion);
CREATE INDEX ix_simulacion_habilidad_habilidad ON simulacion_habilidad (id_habilidad, id_simulacion);
CREATE INDEX ix_intento_usuario_fecha ON intento (id_usuario, fecha_inicio DESC, id_intento);
CREATE INDEX ix_intento_simulacion ON intento (id_simulacion);
CREATE UNIQUE INDEX uq_intento_en_curso ON intento (id_usuario, id_simulacion) WHERE estado = 'EN_CURSO';
CREATE INDEX ix_evidencia_usuario_fecha ON evidencia (id_usuario, fecha_generacion DESC, id_evidencia);
CREATE INDEX ix_comparticion_evidencia ON comparticion (id_evidencia, fecha_creacion DESC, id_comparticion);
-- Una fila FALLIDO permanece en la cabeza hasta recuperarse.
CREATE INDEX ix_evento_sin_aplicar ON evento_sincronizacion (orden_cola) WHERE estado <> 'APLICADO';
