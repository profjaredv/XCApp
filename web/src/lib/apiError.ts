// One place that knows how this API reports errors.
//
// The backend is not consistent about the key: ~409 responses use `msg`,
// ~73 use `message` — and crucially the `message` group includes
// middleware/auth.js, so EVERY 401/403 lands there. Each page had its own
// copy of a reader that checked only `msg`, which meant an auth failure
// fell through to axios's own useless "Request failed with status code
// 401" instead of the real reason.
//
// Reading both is the right fix here rather than renaming 400+ backend
// responses: the shape is what it is, callers shouldn't each have to know
// that, and a rename of that size is its own change with its own blast
// radius.
export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  const data = (error as { response?: { data?: { msg?: unknown; message?: unknown } } })?.response?.data;
  if (typeof data?.msg === 'string' && data.msg.trim()) return data.msg;
  if (typeof data?.message === 'string' && data.message.trim()) return data.message;
  if (error instanceof Error && error.message && !/^Request failed with status code/.test(error.message)) {
    return error.message;
  }
  return fallback;
}

/** True for an auth failure, where the useful advice is "sign in again" rather than the raw text. */
export function isAuthError(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 401 || status === 403;
}
