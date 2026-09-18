import { AuditEvent } from '../models/index.js';
import { logContext } from '../utils/logger.js';

// Callers pass explicitly selected business metadata; this helper never copies
// request bodies, headers, tokens, credentials, or S3 keys into audit records.
const recordAuditEvent = ({ AuditEventModel = AuditEvent, userId, action, resourceType, resourceId, metadata = {}, requestId, transaction }) => AuditEventModel.create({
  actor_user_id: userId, subject_user_id: userId, action, resource_type: resourceType,
  resource_id: resourceId, request_id: requestId || logContext.getStore()?.request_id || null, metadata
}, { transaction });

export { recordAuditEvent };
