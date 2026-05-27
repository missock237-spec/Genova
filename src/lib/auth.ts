export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = process.env.ENCRYPTION_SALT || 'genova-salt-2025-secure';
  const data = encoder.encode(password + salt);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const computed = await hashPassword(password);
  return computed === hash;
}
