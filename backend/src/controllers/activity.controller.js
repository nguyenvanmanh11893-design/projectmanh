import { Op } from 'sequelize';
import { AuditEvent } from '../models/index.js';
import { successResponse } from '../utils/response.js';
import { badRequest } from '../utils/app-error.js';

const list = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const where = { subject_user_id: req.user.id };
    if (req.query.cursor) {
      let cursor;
      try { cursor = JSON.parse(Buffer.from(req.query.cursor, 'base64url').toString('utf8')); } catch { throw badRequest('Invalid activity cursor'); }
      if (!cursor?.created_at || !cursor?.id) throw badRequest('Invalid activity cursor');
      where[Op.or] = [{ created_at: { [Op.lt]: cursor.created_at } }, { created_at: cursor.created_at, id: { [Op.lt]: cursor.id } }];
    }
    const events = await AuditEvent.findAll({ where, attributes: ['id', 'action', 'resource_type', 'resource_id', 'metadata', 'created_at'], order: [['created_at', 'DESC'], ['id', 'DESC']], limit: limit + 1 });
    const items = events.slice(0, limit);
    const last = items.at(-1);
    const next_cursor = events.length > limit && last ? Buffer.from(JSON.stringify({ created_at: last.created_at, id: last.id })).toString('base64url') : null;
    return successResponse(res, 'Activity retrieved successfully', { items, next_cursor }, 200);
  } catch (error) { next(error); }
};
export { list };
