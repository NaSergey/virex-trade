// In-memory access token. Intentionally NOT persisted to localStorage —
// the refresh token lives in an HttpOnly cookie and is used to mint a fresh
// access token on page load (see AuthProvider bootstrap), which is safer
// against XSS than storing the access token in JS-readable storage.
let accessToken: string | null = null;

export const tokenStore = {
  get: (): string | null => accessToken,
  set: (token: string | null): void => {
    accessToken = token;
  },
};
