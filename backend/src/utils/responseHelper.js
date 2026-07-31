'use strict';

exports.sendSuccess = (res, data, statusCode = 200) => {
  return res.status(statusCode).json({ success: true, data });
};

exports.sendError = (res, message, statusCode = 400) => {
  return res.status(statusCode).json({ success: false, error: { message } });
};

exports.sendNotFound = (res, message = 'Not found') => {
  return res.status(404).json({ success: false, error: { message } });
};

exports.sendForbidden = (res, message = 'Forbidden') => {
  return res.status(403).json({ success: false, error: { message } });
};
