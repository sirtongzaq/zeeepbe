export interface SuccessResponse<T> {
  status: 'success';
  data: T;
  message?: string;
}

export interface ErrorResponse {
  status: 'error';
  message: string | string[];
  errorCode: string;
  timestamp: string;
  path: string;
}
