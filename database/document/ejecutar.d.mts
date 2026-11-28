import type { Db, MongoClient } from 'mongodb';
import type { Borrador } from '../../backend/src/repositories/document/contenido.repository.js';
import type { InstantaneaEvidencia } from '../../backend/src/repositories/document/evidencia.repository.js';

export function leerDataset(): {
  relacional: { simulacion: { id_simulacion: string; id_revision_publicada: string | null }[] };
  documental: {
    contenidos_simulacion: Omit<Borrador, 'version'>[];
    evidencias: Omit<InstantaneaEvidencia, 'creado_en'>[];
  };
};
export function conectar(opciones?: { reinicioLocal?: boolean }): { cliente: MongoClient; db: Db };
export function crearColecciones(db: Db): Promise<void>;
export function cargarDataset(db: Db): Promise<void>;
