/**
 * Repositorio de grafo del perfil (Neo4j, dueño A; backend #6): consultas C-01..C-05.
 *
 * El Cypher vive en `database/graph/queries/` (fuente única): es el mismo que prueban
 * `npm run db:graph:probar` y `tests/integration/repositorio-grafo.test.ts` con los casos de
 * `database/graph/tests/esperados.mjs`. Aquí solo se carga, se ejecuta con parámetros y se
 * convierten los valores del driver al formato de la API (fechas ISO en UTC, convenciones §3).
 *
 * El grafo solo da ids, orden y lo que filtran las consultas: los textos y los datos de
 * PostgreSQL los completa el servicio de F3a (backend #8).
 */
import neo4j, { type Driver } from 'neo4j-driver';
import { leerSentencias } from './cypher.js';

/** Lee una consulta de `database/graph/queries/`: debe ser una sola sentencia. */
export function cargarConsulta(archivo: string): string {
  const sentencias = leerSentencias(`queries/${archivo}`);
  const [cypher] = sentencias;
  if (sentencias.length !== 1 || cypher === undefined) {
    throw new Error(`${archivo}: se esperaba una sola sentencia`);
  }
  return cypher;
}

// ---- Tipos de las filas (la API les da su forma final en backend #8) ----

export interface SimulacionRef {
  id_simulacion: string;
  titulo: string;
}

/** C-01 */
export interface Recomendacion {
  simulacion: SimulacionRef;
  habilidades_a_reforzar: string[];
  prioridad: number;
}

/** C-02 */
export interface HabilidadPerfil {
  id_habilidad: string;
  nombre: string;
  nivel_actual: number;
  /** `nivel_objetivo` de la habilidad o, sin él, el mayor `nivel_esperado` de DESARROLLA. */
  objetivo: number | null;
  clasificacion: 'FORTALEZA' | 'AREA_DE_MEJORA' | 'SIN_REFERENCIA';
  aciertos: number;
  parciales: number;
  errores: number;
}

/** C-03 */
export interface Recorrido {
  intento: {
    id_intento: string;
    id_simulacion: string;
    estado: string;
    fecha_inicio: string;
    fecha_fin: string | null;
    puntuacion: number | null;
  };
  decisiones: {
    secuencia: number;
    id_paso: string;
    orden: number;
    id_opcion: string;
    tipo_retroalimentacion: 'ACIERTO' | 'PARCIAL' | 'ERROR';
  }[];
}

/** C-04 */
export interface EvidenciaDeHabilidad {
  id_evidencia: string;
  titulo: string;
  simulacion: SimulacionRef;
  fecha_intento: string;
}

/** C-05 */
export interface Evolucion {
  nivel_actual: number | null;
  puntos: {
    fecha: string;
    id_simulacion: string;
    titulo: string;
    puntuacion: number;
    peso: number;
  }[];
}

export interface PerfilRepositoryGrafo {
  /** C-01: simulaciones PUBLICADAS que refuerzan habilidades por debajo del nivel esperado. */
  recomendaciones(idUsuario: string, limite: number): Promise<Recomendacion[]>;
  /** C-02: fortalezas y áreas de mejora (solo habilidades con progreso). */
  habilidades(idUsuario: string): Promise<HabilidadPerfil[]>;
  /** C-03: `null` si el intento no existe o no es del usuario (404). */
  recorrido(idUsuario: string, idIntento: string): Promise<Recorrido | null>;
  /** C-04: evidencias del usuario que demuestran la habilidad. */
  evidenciasDeHabilidad(idUsuario: string, idHabilidad: string): Promise<EvidenciaDeHabilidad[]>;
  /** C-05: `null` si el usuario o la habilidad no están en el grafo (404). */
  evolucion(idUsuario: string, idHabilidad: string): Promise<Evolucion | null>;
}

/** Valores del driver a JSON: DateTime → ISO en UTC con milisegundos; listas y mapas recursivos. */
export function aPlano(valor: unknown): unknown {
  if (neo4j.isDateTime(valor)) return valor.toStandardDate().toISOString();
  if (Array.isArray(valor)) return valor.map(aPlano);
  if (valor !== null && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, aPlano(v)]));
  }
  return valor;
}

export function crearPerfilRepositoryGrafo(driver: Driver): PerfilRepositoryGrafo {
  const cypher = {
    c01: cargarConsulta('C-01-recomendaciones.cypher'),
    c02: cargarConsulta('C-02-fortalezas.cypher'),
    c03: cargarConsulta('C-03-recorrido.cypher'),
    c04: cargarConsulta('C-04-evidencias.cypher'),
    c05: cargarConsulta('C-05-evolucion.cypher'),
  };

  async function filas<T>(consulta: string, parametros: Record<string, unknown>): Promise<T[]> {
    const { records } = await driver.executeQuery(consulta, parametros, {
      routing: neo4j.routing.READ,
    });
    return records.map((r) => aPlano(r.toObject()) as T);
  }

  return {
    recomendaciones: (idUsuario, limite) => filas<Recomendacion>(cypher.c01, { idUsuario, limite }),

    habilidades: (idUsuario) => filas<HabilidadPerfil>(cypher.c02, { idUsuario }),

    async recorrido(idUsuario, idIntento) {
      const [fila] = await filas<Recorrido>(cypher.c03, { idUsuario, idIntento });
      return fila ?? null;
    },

    evidenciasDeHabilidad: (idUsuario, idHabilidad) =>
      filas<EvidenciaDeHabilidad>(cypher.c04, { idUsuario, idHabilidad }),

    async evolucion(idUsuario, idHabilidad) {
      const [fila] = await filas<Evolucion>(cypher.c05, { idUsuario, idHabilidad });
      return fila ?? null;
    },
  };
}
