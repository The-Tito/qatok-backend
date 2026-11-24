ALTER TABLE evento_sincronizacion
  ADD COLUMN IF NOT EXISTS proximo_intento TIMESTAMPTZ
    CONSTRAINT ck_evento_proximo_intento CHECK (estado = 'PENDIENTE' OR proximo_intento IS NULL);
