import type { UserRole } from '@prisma/client'

// No server-only imports here (no next/headers, no prisma) — this must stay
// safe to import from client components, e.g. to gate UI on the user's role.
export function canManage(role?: UserRole | string) {
  return role === 'OWNER' || role === 'MANAGER'
}
