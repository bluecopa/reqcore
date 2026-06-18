import { eq, and } from 'drizzle-orm'
import { document } from '../../../database/schema'
import { parseDocument } from '../../../utils/resume-parser'
import { z } from 'zod'
import { logInfo, logWarn } from '../../../utils/logger'

const paramsSchema = z.object({ id: z.string().min(1) })

/**
 * POST /api/documents/:id/parse
 *
 * Re-parse an existing document to extract text content.
 * Downloads the file from S3, parses it, and updates parsedContent.
 * Useful for:
 *   - Documents uploaded before the parser was added
 *   - Retrying after a failed parse
 *
 * Security:
 *   - Auth required, org-scoped
 *   - Document must belong to the authenticated org
 */
export default defineEventHandler(async (event) => {
  const session = await requirePermission(event, { document: ['update'] })
  const orgId = session.session.activeOrganizationId
  const { id: documentId } = await getValidatedRouterParams(event, paramsSchema.parse)

  const doc = await db.query.document.findFirst({
    where: and(
      eq(document.id, documentId),
      eq(document.organizationId, orgId),
    ),
    columns: {
      id: true,
      storageKey: true,
      mimeType: true,
      originalFilename: true,
    },
  })

  if (!doc) {
    throw createError({ statusCode: 404, statusMessage: 'Document not found' })
  }

  logInfo('reparse.downloaded', { docId: documentId, bytes: fileBuffer.length, mimeType: doc.mimeType })

  // Parse document content
  const parsedContent = await parseDocument(fileBuffer, doc.mimeType)

  if (!parsedContent) {
    logWarn('reparse.failed', { docId: documentId, mimeType: doc.mimeType, fileName: doc.originalFilename })
    throw createError({
      statusCode: 422,
      statusMessage: 'Failed to extract text from this document. The file may be image-based or corrupted.',
    })
  }

  // Update the document record with parsed content
  await db.update(document)
    .set({ parsedContent: parsedContent as any })
    .where(eq(document.id, documentId))

  return {
    id: doc.id,
    parsed: true,
    wordCount: parsedContent.metadata.wordCount,
    sectionCount: parsedContent.sections.length,
    sourceFormat: parsedContent.metadata.sourceFormat,
  }
})
