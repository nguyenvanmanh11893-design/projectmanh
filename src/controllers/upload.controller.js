import * as quotaService from '../services/quota.service.js';
import { successResponse } from '../utils/response.js';

const create = async (req, res, next) => {
  try {
    const session = await quotaService.reserveQuota(req.user.id, req.body, req.get('Idempotency-Key'));
    return successResponse(res, 'Upload session reserved successfully', session, 201);
  } catch (error) { next(error); }
};

const getById = async (req, res, next) => {
  try { return successResponse(res, 'Upload session retrieved successfully', await quotaService.getUploadSession(req.user.id, req.params.id)); }
  catch (error) { next(error); }
};

export { create, getById };
