/**
 * Convierte cualquier error en el formato de la API (convenciones §5):
 *   { "error": { "code", "message", "details"? } }
 * El detalle técnico de un error inesperado solo va al log, nunca a la respuesta.
 */
import type { ErrorRespuesta } from '@qatok/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { baseNoDisponible, ErrorApp } from '../lib/errores.js';
import type { Logger } from '../lib/logger.js';

const body = (code: string, message: string, details?: Record<string, unknown>) =>
  ({ error: { code, message, ...(details ? { details } : {}) } }) satisfies ErrorRespuesta;

export const rutaNoEncontrada: RequestHandler = () => {
  throw new ErrorApp('NOT_FOUND', 404, 'Route not found');
};

export function manejarErrores(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _req, res, _next) => {
    if (error instanceof ErrorApp) {
      if (error.codigo === 'UNAUTHENTICATED') res.set('WWW-Authenticate', 'Bearer');
      res.status(error.estado).json(body(error.codigo, error.message, error.detalles));
      return;
    }
    if (error instanceof ZodError) {
      const fields = error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      res.status(400).json(body('VALIDATION_ERROR', 'Invalid request data', { fields }));
      return;
    }
    // JSON mal formado en el cuerpo (lo lanza express.json()).
    if (
      error instanceof SyntaxError &&
      (error as { type?: string }).type === 'entity.parse.failed'
    ) {
      res.status(400).json(body('VALIDATION_ERROR', 'The request body is not valid JSON'));
      return;
    }
    if (error instanceof Error && (error as { type?: string }).type === 'entity.too.large') {
      res.status(413).json(body('PAYLOAD_TOO_LARGE', 'The request body is too large'));
      return;
    }
    const database = baseNoDisponible(error);
    if (database) {
      const databases = {
        relacional: 'relational',
        documental: 'document',
        grafo: 'graph',
      } as const;
      const name = databases[database];
      logger.error({ database: name }, 'Database unavailable');
      res
        .status(503)
        .json(body('DATABASE_UNAVAILABLE', 'A database is unavailable', { database: name }));
      return;
    }
    logger.error(
      { errorType: error instanceof Error ? error.name : 'unknown' },
      'Unhandled request error',
    );
    res.status(500).json(body('INTERNAL_ERROR', 'An unexpected error occurred'));
  };
}
