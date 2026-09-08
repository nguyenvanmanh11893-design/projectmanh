
const successResponse = (res, message = 'Success', data = null, statusCode = 200) => {
  const responsePayload = {
    success: true,
    message
  };

  if (data !== null && data !== undefined) {
    responsePayload.data = data;
  }

  return res.status(statusCode).json(responsePayload);
};


const errorResponse = (res, message = 'An error occurred', statusCode = 500, errors = null) => {
  const responsePayload = {
    success: false,
    message
  };

  if (errors) {
    responsePayload.errors = errors;
  }

  return res.status(statusCode).json(responsePayload);
};

module.exports = {
  successResponse,
  errorResponse
};
