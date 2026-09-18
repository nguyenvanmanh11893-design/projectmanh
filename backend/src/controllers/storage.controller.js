import { getUsage } from '../services/quota.service.js';
import { successResponse } from '../utils/response.js';

const usage = async (req, res, next) => {
  try { return successResponse(res, 'Storage usage retrieved successfully', await getUsage(req.user.id)); }
  catch (error) { next(error); }
};

export { usage };
