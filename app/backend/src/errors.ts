export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly action?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function assertAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  console.error('Unhandled backend error', error);
  return new AppError('internal', 'Something went wrong while processing the request.', 500);
}
