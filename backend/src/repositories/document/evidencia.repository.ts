import { Uuid, type PasoVista } from '@qatok/shared';
import type { Db } from 'mongodb';

export interface InstantaneaEvidencia {
  _id: string;
  descripcion: string;
  simulacion: { id_simulacion: string; titulo: string };
  puntuacion: number;
  habilidades: { id_habilidad: string; nombre: string }[];
  decisiones: {
    secuencia: number;
    paso: { titulo: string; tipo: PasoVista['tipo'] };
    opcion: string;
    consecuencias: string[];
    retroalimentacion_tipo: 'ACIERTO' | 'PARCIAL' | 'ERROR';
  }[];
  creado_en: Date;
}

export function crearEvidenciaRepository(db: Db) {
  const evidencias = db.collection<InstantaneaEvidencia>('evidencias');
  return {
    obtener(idEvidencia: string) {
      return evidencias.findOne({ _id: Uuid.parse(idEvidencia) });
    },
    guardar(instantanea: InstantaneaEvidencia) {
      return evidencias.insertOne(instantanea);
    },
    eliminar(idEvidencia: string) {
      return evidencias.deleteOne({ _id: Uuid.parse(idEvidencia) });
    },
  };
}
