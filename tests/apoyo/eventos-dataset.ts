/**
 * El dataset común (database/seed/dataset.json) como la secuencia de eventos de sincronización
 * que habrían emitido F1, F2 y F3a al crear esos datos (matriz §4 y §5). Sirve para probar que
 * aplicar eventos construye el mismo grafo que `npm run db:graph:reset`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { nuevoEvento, type Evento } from '../../backend/src/sync/eventos.js';

interface Dataset {
  relacional: {
    usuario: { id_usuario: string }[];
    habilidad: { id_habilidad: string; nombre: string; nivel_objetivo: number | null }[];
    simulacion: { id_simulacion: string; titulo: string; estado: string }[];
    simulacion_habilidad: {
      id_simulacion: string;
      id_habilidad: string;
      peso: number;
      nivel_esperado: number;
    }[];
    intento: {
      id_intento: string;
      id_usuario: string;
      id_simulacion: string;
      fecha_inicio: string;
      fecha_fin: string | null;
      estado: string;
      puntuacion: number | null;
    }[];
    respuesta: {
      id_respuesta: string;
      id_intento: string;
      id_paso: string;
      id_opcion: string;
      secuencia: number;
    }[];
    evidencia: { id_evidencia: string; id_usuario: string; id_intento: string; titulo: string }[];
  };
  documental: {
    contenidos_simulacion: {
      _id: string;
      pasos: {
        id_paso: string;
        orden: number;
        opciones: {
          id_opcion: string;
          id_paso_siguiente: string | null;
          retroalimentacion: { tipo: 'ACIERTO' | 'PARCIAL' | 'ERROR' };
        }[];
      }[];
    }[];
  };
}

const RUTA = fileURLToPath(new URL('../../database/seed/dataset.json', import.meta.url));

export function eventosDelDataset(): Evento[] {
  const { relacional: r, documental: d } = JSON.parse(readFileSync(RUTA, 'utf8')) as Dataset;
  const eventos: Evento[] = [];
  const tipoRetro = new Map(
    d.contenidos_simulacion.flatMap((c) =>
      c.pasos.flatMap((p) => p.opciones.map((o) => [o.id_opcion, o.retroalimentacion.tipo])),
    ),
  );

  for (const u of r.usuario)
    eventos.push(nuevoEvento('USUARIO_CREADO', { id_usuario: u.id_usuario }));
  for (const h of r.habilidad) {
    eventos.push(
      nuevoEvento('HABILIDAD_GUARDADA', {
        id_habilidad: h.id_habilidad,
        nombre: h.nombre,
        nivel_objetivo: h.nivel_objetivo,
      }),
    );
  }

  // Una simulación en BORRADOR no emite eventos (crear y cargar contenido no tocan el grafo).
  for (const s of r.simulacion.filter((x) => x.estado !== 'BORRADOR')) {
    const contenido = d.contenidos_simulacion.find((c) => c._id === s.id_simulacion);
    if (!contenido) throw new Error(`Simulación sin contenido: ${s.id_simulacion}`);
    eventos.push(
      nuevoEvento('SIMULACION_PUBLICADA', {
        id_simulacion: s.id_simulacion,
        titulo: s.titulo,
        habilidades: r.simulacion_habilidad
          .filter((x) => x.id_simulacion === s.id_simulacion)
          .map(({ id_habilidad, peso, nivel_esperado }) => ({
            id_habilidad,
            peso,
            nivel_esperado,
          })),
        pasos: contenido.pasos.map((p) => ({
          id_paso: p.id_paso,
          orden: p.orden,
          opciones: p.opciones.map((o) => ({
            id_opcion: o.id_opcion,
            id_paso_siguiente: o.id_paso_siguiente,
          })),
        })),
      }),
    );
    if (s.estado === 'INACTIVA') {
      eventos.push(
        nuevoEvento('SIMULACION_ESTADO_CAMBIADO', {
          id_simulacion: s.id_simulacion,
          estado: 'INACTIVA',
        }),
      );
    }
  }

  const intentos = [...r.intento].sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
  for (const i of intentos) {
    eventos.push(
      nuevoEvento('INTENTO_INICIADO', {
        id_intento: i.id_intento,
        id_usuario: i.id_usuario,
        id_simulacion: i.id_simulacion,
        fecha_inicio: i.fecha_inicio,
      }),
    );
    const respuestas = r.respuesta
      .filter((x) => x.id_intento === i.id_intento)
      .sort((a, b) => a.secuencia - b.secuencia);
    for (const x of respuestas) {
      const tipo = tipoRetro.get(x.id_opcion);
      if (!tipo) throw new Error(`Opción sin retroalimentación: ${x.id_opcion}`);
      eventos.push(
        nuevoEvento('RESPUESTA_REGISTRADA', {
          id_respuesta: x.id_respuesta,
          id_intento: x.id_intento,
          id_paso: x.id_paso,
          id_opcion: x.id_opcion,
          secuencia: x.secuencia,
          tipo_retroalimentacion: tipo,
        }),
      );
    }
    if ((i.estado === 'COMPLETADO' || i.estado === 'ABANDONADO') && i.fecha_fin) {
      eventos.push(
        nuevoEvento('INTENTO_FINALIZADO', {
          id_intento: i.id_intento,
          estado: i.estado,
          fecha_fin: i.fecha_fin,
          puntuacion: i.puntuacion,
        }),
      );
    }
  }

  for (const e of r.evidencia) {
    eventos.push(
      nuevoEvento('EVIDENCIA_GENERADA', {
        id_evidencia: e.id_evidencia,
        id_usuario: e.id_usuario,
        id_intento: e.id_intento,
        titulo: e.titulo,
      }),
    );
  }
  return eventos;
}
