import { createHash } from 'node:crypto';
import type { Db } from 'mongodb';
import type { Sources } from '../../reconciliation/model.js';
import type { Borrador, Revision } from './contenido.repository.js';
import type { InstantaneaEvidencia } from './evidencia.repository.js';

const graceMs = 10 * 60 * 1000;
type DraftMarker = { _id: string; fingerprint: string; firstSeenAt: Date };
type OrphanKind = 'orphan_draft' | 'orphan_revision' | 'orphan_evidence';
type Orphan = {
  id: string;
  kind: OrphanKind;
  eligible: boolean;
  remove(): Promise<{ deletedCount: number }>;
};

export function createDocumentReconciliation(db: Db) {
  const drafts = db.collection<Borrador>('contenidos_simulacion');
  const revisions = db.collection<Revision>('revisiones_simulacion');
  const evidence = db.collection<InstantaneaEvidencia>('evidencias');
  const markers = db.collection<DraftMarker>('reconciliacion_borradores');

  return {
    async inspect(sources: Sources, now: Date) {
      const simulationIds = new Set(sources.simulations.map(({ id_simulacion }) => id_simulacion));
      const revisionIds = new Set(
        sources.simulations.map(({ id_revision_publicada }) => id_revision_publicada),
      );
      const evidenceIds = new Set(sources.evidence.map(({ id_evidencia }) => id_evidencia));
      const [draftsFound, revisionsFound, evidenceFound, marksFound] = await Promise.all([
        drafts.find().toArray(),
        revisions.find().toArray(),
        evidence
          .find()
          .project<Pick<InstantaneaEvidencia, '_id' | 'creado_en'>>({ _id: 1, creado_en: 1 })
          .toArray(),
        markers.find().toArray(),
      ]);
      const orphans: Orphan[] = [];
      const orphansWithoutDate: DraftMarker[] = [];
      const marked = new Map(marksFound.map((mark) => [mark._id, mark]));
      const cutoff = now.getTime() - graceMs;
      for (const draft of draftsFound) {
        if (simulationIds.has(draft._id)) continue;
        const fingerprint = createHash('sha256').update(JSON.stringify(draft)).digest('hex');
        const mark = marked.get(draft._id);
        const marker =
          mark?.fingerprint === fingerprint
            ? mark
            : { _id: draft._id, fingerprint, firstSeenAt: now };
        orphansWithoutDate.push(marker);
        orphans.push({
          id: draft._id,
          kind: 'orphan_draft',
          eligible: marker.firstSeenAt.getTime() <= cutoff,
          remove: () =>
            drafts.deleteOne({ _id: draft._id, version: draft.version, pasos: draft.pasos }),
        });
      }
      for (const revision of revisionsFound) {
        if (revisionIds.has(revision._id)) continue;
        orphans.push({
          id: revision._id,
          kind: 'orphan_revision',
          eligible: revision.creado_en instanceof Date && revision.creado_en.getTime() <= cutoff,
          remove: () =>
            revisions.deleteOne({
              _id: revision._id,
              id_simulacion: revision.id_simulacion,
              version: revision.version,
              creado_en: revision.creado_en,
            }),
        });
      }
      for (const doc of evidenceFound) {
        if (evidenceIds.has(doc._id)) continue;
        orphans.push({
          id: doc._id,
          kind: 'orphan_evidence',
          eligible: doc.creado_en instanceof Date && doc.creado_en.getTime() <= cutoff,
          remove: () => evidence.deleteOne({ _id: doc._id, creado_en: doc.creado_en }),
        });
      }
      const foundEvidence = new Set(evidenceFound.map(({ _id }) => _id));
      return {
        revisions: revisionsFound,
        orphanSummary: orphans.map(({ id, kind, eligible }) => ({ id, kind, eligible })),
        missingEvidence: sources.evidence.flatMap(({ id_evidencia }) =>
          foundEvidence.has(id_evidencia) ? [] : [id_evidencia],
        ),
        async repair() {
          const removed: { id: string; kind: OrphanKind }[] = [];
          const retained = new Set<string>();
          for (const orphan of orphans) {
            if (orphan.eligible && (await orphan.remove()).deletedCount === 1) {
              removed.push({ id: orphan.id, kind: orphan.kind });
            } else if (orphan.kind === 'orphan_draft') {
              retained.add(orphan.id);
            }
          }
          for (const marker of orphansWithoutDate) {
            if (retained.has(marker._id))
              await markers.replaceOne({ _id: marker._id }, marker, { upsert: true });
          }
          const stale = marksFound.flatMap(({ _id }) => (retained.has(_id) ? [] : [_id]));
          if (stale.length) await markers.deleteMany({ _id: { $in: stale } });
          return removed;
        },
      };
    },
  };
}
