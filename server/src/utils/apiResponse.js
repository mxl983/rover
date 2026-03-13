/**
 * Consistent API response helpers for production-style endpoints.
 */

export function success(res, data = null, status = 200) {
  const body =
    data !== null && typeof data === "object" && !Array.isArray(data)
      ? { success: true, ...data }
      : { success: true };
  res.status(status).json(body);
}

export function error(res, message, status = 500) {
  res.status(status).json({ success: false, error: message });
}

export function notFound(res, message = "Not found") {
  error(res, message, 404);
}

export function badRequest(res, message = "Bad request") {
  error(res, message, 400);
}

/**
 * Wraps async route handlers so thrown errors are passed to next().
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
