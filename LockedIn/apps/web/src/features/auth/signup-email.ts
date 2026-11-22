const key = "lockedin:signup-email";

// One-time handoff in the same tab. Keep the address out of URLs and server logs.
export function storeSignupEmail(email: string) {
  try { window.sessionStorage.setItem(key, email); } catch { /* Signup still works with storage disabled. */ }
}

export function takeSignupEmail(): string | null {
  try {
    const email = window.sessionStorage.getItem(key);
    window.sessionStorage.removeItem(key);
    return email;
  } catch {
    return null;
  }
}
