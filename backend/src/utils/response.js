
const successResponse = (res, message = 'Success', data = null, statusCode = 200) => {
  const responsePayload = {
    success: true,
    message
  };

  if (data !== null && data !== undefined) {
    responsePayload.data = data;
  }

  if (res.locals.requestId) responsePayload.request_id = res.locals.requestId;
  return res.status(statusCode).json(responsePayload);
};

const errorResponse = (res, { message = 'An error occurred', statusCode = 500, code = 'INTERNAL_ERROR', details = null } = {}) => {
  const responsePayload = {
    success: false,
    message,
    error: { code, message, request_id: res.locals.requestId || null },
    request_id: res.locals.requestId || null
  };

  if (details) {
    responsePayload.errors = details;
  }

  return res.status(statusCode).json(responsePayload);
};

export {
  successResponse,
  errorResponse
};
