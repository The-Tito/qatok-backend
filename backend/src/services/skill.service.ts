import { randomUUID } from 'node:crypto';
import type { SkillInput } from '@qatok/shared';
import type { Pool } from 'pg';
import type { z } from 'zod';
import { ErrorApp } from '../lib/errores.js';
import { encolarEventos } from '../repositories/relational/outbox.repository.js';
import type { SkillRepository } from '../repositories/relational/skill.repository.js';
import { inTransaction, violatesConstraint } from '../repositories/relational/transaction.js';
import { nuevoEvento } from '../sync/eventos.js';
import { toSynchronization } from '../sync/http-status.js';
import type { ProcesadorSincronizacion } from '../sync/procesador.js';

export function createSkillService(
  pool: Pool,
  skills: SkillRepository,
  synchronization: ProcesadorSincronizacion,
) {
  async function save(id: string | null, input: z.output<typeof SkillInput>) {
    const skill = {
      id: id ?? randomUUID(),
      ...input,
      target_level: input.target_level ?? null,
      visual_type: input.visual_type ?? null,
    };
    const event = nuevoEvento('HABILIDAD_GUARDADA', {
      id_habilidad: skill.id,
      nombre: skill.name,
      nivel_objetivo: skill.target_level,
    });
    const result = await inTransaction(pool, async (client) => {
      const saved = id ? await skills.update(client, skill) : await skills.insert(client, skill);
      if (!saved) throw new ErrorApp('NOT_FOUND', 404, 'Skill not found');
      await encolarEventos(client, [event]);
      return saved;
    }).catch((error: unknown) => {
      if (violatesConstraint(error, '23505', 'uq_habilidad_nombre')) {
        throw new ErrorApp('SKILL_ALREADY_EXISTS', 409, 'A skill with that name already exists');
      }
      throw error;
    });
    return {
      skill: result,
      synchronization: toSynchronization(await synchronization.aplicarAhora([event])),
    };
  }

  return {
    list: skills.list,
    save,
    async delete(id: string) {
      const event = nuevoEvento('HABILIDAD_ELIMINADA', { id_habilidad: id });
      await inTransaction(pool, async (client) => {
        if (!(await skills.delete(client, id)))
          throw new ErrorApp('NOT_FOUND', 404, 'Skill not found');
        await encolarEventos(client, [event]);
      }).catch((error: unknown) => {
        if (violatesConstraint(error, '23503', 'fk_simulacion_habilidad_habilidad')) {
          throw new ErrorApp('SKILL_IN_USE', 409, 'The skill is assigned to a simulation');
        }
        throw error;
      });
      return {
        deleted: true as const,
        synchronization: toSynchronization(await synchronization.aplicarAhora([event])),
      };
    },
  };
}

export type SkillService = ReturnType<typeof createSkillService>;
