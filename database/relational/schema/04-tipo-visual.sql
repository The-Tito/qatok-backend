ALTER TABLE habilidad
  ADD COLUMN IF NOT EXISTS tipo_visual VARCHAR(10)
    CONSTRAINT ck_habilidad_tipo_visual
    CHECK (tipo_visual IN ('VOICE', 'FIRE', 'CLOCK', 'LEAF', 'SPARK', 'HEART', 'MIND', 'STONE'));
