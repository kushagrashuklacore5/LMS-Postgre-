/**
 * Global Error Handler
 * 
 * Catches any unhandled error thrown inside a route and returns 
 * HTTP 500 in the standard format instead of leaking a stack trace.
 * Never returns raw PostgreSQL error objects to the client.
 */

const handlePostgresError = (error) => {
  // Handle specific PostgreSQL error codes
  switch (error.code) {
    case '23505': // unique_violation
      return {
        success: false,
        error: 'duplicate_entry',
        message: 'A record with this value already exists.'
      };
    
    case '23503': // foreign_key_violation
      return {
        success: false,
        error: 'invalid_reference',
        message: 'Referenced record does not exist.'
      };
    
    case '23502': // not_null_violation
      return {
        success: false,
        error: 'missing_required_field',
        message: 'A required field was not provided.'
      };
    
    case '42P01': // undefined_table
      return {
        success: false,
        error: 'schema_error',
        message: 'Database schema error. Please contact support.'
      };
    
    case 'ECONNREFUSED':
      return {
        success: false,
        error: 'db_connection_failed',
        message: 'Database temporarily unavailable.'
      };
    
    case 'ENOTFOUND':
      return {
        success: false,
        error: 'db_connection_failed',
        message: 'Database server not reachable.'
      };
    
    case 'ETIMEDOUT':
      return {
        success: false,
        error: 'db_connection_timeout',
        message: 'Database connection timeout.'
      };
    
    default:
      return {
        success: false,
        error: 'database_error',
        message: 'A database error occurred.'
      };
  }
};

const handleValidationError = (error) => {
  if (error.name === 'ValidationError') {
    return {
      success: false,
      error: 'validation_error',
      message: error.message || 'Validation failed'
    };
  }
  
  if (error.name === 'CastError') {
    return {
      success: false,
      error: 'invalid_input',
      message: 'Invalid input format'
    };
  }
  
  return null;
};

const handleJWTError = (error) => {
  if (error.name === 'JsonWebTokenError') {
    return {
      success: false,
      error: 'invalid_token',
      message: 'Invalid authentication token'
    };
  }
  
  if (error.name === 'TokenExpiredError') {
    return {
      success: false,
      error: 'token_expired',
      message: 'Authentication token has expired'
    };
  }
  
  if (error.name === 'NotBeforeError') {
    return {
      success: false,
      error: 'token_not_active',
      message: 'Authentication token is not yet active'
    };
  }
  
  return null;
};

const globalErrorHandler = (error, req, res, next) => {
  // Log the full error for debugging
  console.error('Global error handler caught:', {
    message: error.message,
    stack: error.stack,
    code: error.code,
    path: req.path,
    method: req.method,
    user: req.user?.id || 'anonymous'
  });

  // Check if response has already been sent
  if (res.headersSent) {
    return next(error);
  }

  // Client mistakes reported by Express itself: malformed JSON, a body that is too large,
  // a badly encoded URL. They are the caller's error (4xx), not a server failure.
  const clientStatus = error.status || error.statusCode;
  if (Number.isInteger(clientStatus) && clientStatus >= 400 && clientStatus < 500) {
    return res.status(clientStatus).json({
      success: false,
      error: 'bad_request',
      message: clientStatus === 413 ? 'The request body is too large' : 'The request could not be understood'
    });
  }

  let errorResponse;

  // Handle different types of errors
  if (error.code && typeof error.code === 'string') {
    // PostgreSQL errors
    errorResponse = handlePostgresError(error);
  } else if (error.name) {
    // JWT errors
    errorResponse = handleJWTError(error);
    
    if (!errorResponse) {
      // Validation errors
      errorResponse = handleValidationError(error);
    }
  }

  // If no specific handler matched, use a generic error response
  if (!errorResponse) {
    errorResponse = {
      success: false,
      error: 'server_error',
      message: 'An internal server error occurred'
    };
  }

  // Stack traces and raw error text stay in the server log; they are never sent to a client.

  // Send error response
  res.status(500).json(errorResponse);
};

// Async error wrapper for route handlers
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  globalErrorHandler,
  asyncHandler,
  handlePostgresError,
  handleValidationError,
  handleJWTError
};
