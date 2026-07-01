# NEXORA — Multi-Project (Multi-Property) Implementation Plan

**Goal:** Let a user own/manage **multiple projects** (properties/banquets/hotels) under one
account, switch between them, and have **every feature** (leads, campaigns, WhatsApp, analytics,
platforms, proposals, AI calls, settings) scoped to the **currently active project**.

**Audience:** the engineer/model implementing this (Sonnet 5). Follow the steps in order. Code
snippets are the intended approach — adapt names/imports to match the file you're editing.

---

## 0. Why this is small (read first)

The data model **already supports multi-property**:
- `User` ↔ `Property` is many-to-many via the `UserProperty` join table (`prisma/schema.prisma`).
- `Lead`, `Campaign`, `PlatformListing`, `MessageTemplate`, `BroadcastCampaign`,
  `IntegrationConnection`, `AiCall`, etc. all carry `propertyId`.
- **All 48 API routes already filter by `session.user.propertyId`.**

So we do **NOT** touch those 48 routes and we do **NOT** run a Prisma migration. The entire
feature rests on one change: **`requireSession()` resolves an "active project" (from a cookie,
verified against `UserProperty`) and overrides `session.user.propertyId` with it.** Everything
downstream inherits the active project for free.

Current behavior to replace: `lib/auth.ts` `authorize()` bakes the user's **first** property
(`properties[0]`, `take: 1`) into the JWT at login. That becomes only a *fallback default*.

---

## 1. The linchpin — rewrite `lib/access.ts`

This is the most important change. Do it first and verify existing pages/routes still work before
building anything else.

```ts
// lib/access.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const ACTIVE_PROPERTY_COOKIE = 'nexora_active_property'

/**
 * Resolves the caller's session AND the active project.
 * - Reads the active-property cookie; honors it ONLY if the user is a member (UserProperty).
 * - Falls back to the JWT's propertyId (first property), else the user's first membership.
 * - Overrides session.user.propertyId with the resolved id so ALL existing routes
 *   automatically operate on the active project.
 */
export async function requireSession() {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), session: null }
  }

  const userId = session.user.id
  const store = await cookies() // async in Next 15
  const requested = store.get(ACTIVE_PROPERTY_COOKIE)?.value

  const isMember = (propertyId?: string | null) =>
    !!propertyId &&
    prisma.userProperty.findUnique({
      where: { userId_propertyId: { userId, propertyId } },
    })

  let activeId: string | null = null
  if (requested && (await isMember(requested))) activeId = requested
  if (!activeId && (await isMember(session.user.propertyId))) activeId = session.user.propertyId
  if (!activeId) {
    const first = await prisma.userProperty.findFirst({
      where: { userId },
      orderBy: { propertyId: 'asc' },
    })
    activeId = first?.propertyId ?? null
  }

  if (!activeId) {
    return { error: NextResponse.json({ error: 'No project linked to your account.' }, { status: 401 }), session: null }
  }

  session.user.propertyId = activeId // <-- the whole feature hinges on this line
  return { error: null, session }
}

export function canManage(role?: string) {
  return role === 'OWNER' || role === 'MANAGER'
}
```

Notes:
- `UserProperty` has `@@id([userId, propertyId])` → Prisma's composite selector is
  `userId_propertyId`. Confirm against generated client.
- Mutating `session.user.propertyId` is safe: `auth()` returns a fresh per-request object.
- Cost: +1–2 indexed lookups per request. Fine for now.
- **Verify checkpoint:** after this change, the app should behave exactly as before (single
  project resolves via fallback). Load dashboard, leads, analytics — all must still work.

---

## 2. New API — project list & create: `app/api/projects/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import { ACTIVE_PROPERTY_COOKIE, canManage, requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'
import { seedPropertyDefaults } from '@/lib/seeds/property-defaults'
import { projectCreateSchema } from '@/lib/validations/settings' // add in step 4

// GET /api/projects → all projects the user can access + which one is active
export async function GET() {
  const { error, session } = await requireSession()
  if (error) return error

  const memberships = await prisma.userProperty.findMany({
    where: { userId: session.user.id },
    include: { property: { include: { organization: { select: { name: true } } } } },
    orderBy: { property: { name: 'asc' } },
  })

  const projects = memberships.map((m) => ({
    id: m.property.id,
    name: m.property.name,
    city: m.property.city,
    organizationName: m.property.organization.name,
  }))

  // requireSession already resolved the active id into session.user.propertyId
  return NextResponse.json({ projects, activeId: session.user.propertyId })
}

// POST /api/projects → create a new project in the user's org, link the user, seed defaults, activate it
export async function POST(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error
  if (!canManage(session.user.role)) {
    return NextResponse.json({ error: 'Only owners/managers can add projects.' }, { status: 403 })
  }

  const parsed = projectCreateSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const project = await prisma.$transaction(async (tx) => {
    const p = await tx.property.create({
      data: { ...parsed.data, organizationId: session.user.organizationId },
    })
    await tx.userProperty.create({ data: { userId: session.user.id, propertyId: p.id } })
    return p
  })

  // Seed templates/platforms/campaigns (idempotent). Await so the new project isn't empty on first view.
  await seedPropertyDefaults(prisma, project.id).catch((e) => console.error('[projects] seed failed', e))

  // Make the new project active immediately.
  const store = await cookies()
  store.set(ACTIVE_PROPERTY_COOKIE, project.id, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 60 * 60 * 24 * 365,
  })

  return NextResponse.json({ project: { id: project.id, name: project.name } }, { status: 201 })
}
```

---

## 3. New API — switch active project: `app/api/projects/switch/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import { ACTIVE_PROPERTY_COOKIE, requireSession } from '@/lib/access'
import { prisma } from '@/lib/db'

// POST /api/projects/switch  { propertyId }
export async function POST(request: NextRequest) {
  const { error, session } = await requireSession()
  if (error) return error

  const { propertyId } = await request.json()
  if (!propertyId || typeof propertyId !== 'string') {
    return NextResponse.json({ error: 'propertyId required' }, { status: 400 })
  }

  // Security: only switch to a project the user is a member of.
  const member = await prisma.userProperty.findUnique({
    where: { userId_propertyId: { userId: session.user.id, propertyId } },
  })
  if (!member) return NextResponse.json({ error: 'Not a member of that project.' }, { status: 403 })

  const store = await cookies()
  store.set(ACTIVE_PROPERTY_COOKIE, propertyId, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 60 * 60 * 24 * 365,
  })

  return NextResponse.json({ ok: true, activeId: propertyId })
}
```

---

## 4. Validation schema — `lib/validations/settings.ts`

Add alongside the existing `propertyUpdateSchema` (reuse its shape):

```ts
export const projectCreateSchema = z.object({
  name: z.string().min(2),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
})
```

---

## 5. Client — active project context: `components/active-project-provider.tsx`

A React context that fetches the project list + active id, and exposes a `switchTo` action.
**Critical:** switching must invalidate *all* React Query caches (data from the old project is
now stale) and refresh server components.

```tsx
'use client'
import { createContext, useContext } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'

type Project = { id: string; name: string; city?: string | null; organizationName: string }
type Ctx = {
  projects: Project[]
  activeId: string | null
  activeProject: Project | null
  isLoading: boolean
  switchTo: (id: string) => Promise<void>
}
const ActiveProjectContext = createContext<Ctx | null>(null)

export function ActiveProjectProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient()
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const r = await fetch('/api/projects')
      if (!r.ok) throw new Error('failed')
      return r.json() as Promise<{ projects: Project[]; activeId: string }>
    },
  })

  const switchMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch('/api/projects/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: id }),
      })
      if (!r.ok) throw new Error('switch failed')
    },
    onSuccess: async () => {
      await qc.invalidateQueries()   // ALL queries — drop stale data from the previous project
      router.refresh()               // refresh any server components
    },
  })

  const projects = data?.projects ?? []
  const activeId = data?.activeId ?? null
  const activeProject = projects.find((p) => p.id === activeId) ?? null

  return (
    <ActiveProjectContext.Provider
      value={{ projects, activeId, activeProject, isLoading, switchTo: (id) => switchMut.mutateAsync(id) }}
    >
      {children}
    </ActiveProjectContext.Provider>
  )
}

export function useActiveProject() {
  const ctx = useContext(ActiveProjectContext)
  if (!ctx) throw new Error('useActiveProject must be used within ActiveProjectProvider')
  return ctx
}
```

---

## 6. Wire the provider — `app/providers.tsx`

Nest `ActiveProjectProvider` **inside** the existing `QueryClientProvider` (and `SessionProvider`),
so it can use React Query and be available to the sidebar. Read the file first to match the
existing provider nesting; add `<ActiveProjectProvider>` as the innermost wrapper around
`{children}`.

---

## 7. Project switcher UI — `components/project-switcher.tsx`

Dropdown for the sidebar header. Lists projects, checkmarks the active one, and has an
"+ Add project" action that opens a small modal (name + optional city/phone/email) which POSTs to
`/api/projects`, then invalidates `['projects']` and all queries, then `router.refresh()`.

Behavior:
- Trigger button shows `activeProject?.name ?? 'Select project'`.
- Clicking a project → `switchTo(id)`.
- Only show "+ Add project" if `canManage(session.user.role)` (OWNER/MANAGER). Read role from
  `useSession()`.
- Use the existing toast (`react-hot-toast`) for success/error, matching `settings/page.tsx`.

---

## 8. Sidebar — `components/sidebar.tsx`

- Replace (or augment) the static header block (lines ~52–63, the "NEXORA / Revenue OS" box) so it
  renders `<ProjectSwitcher />` beneath the logo, showing the active project name.
- The sidebar currently shows only user name/email at the bottom — leave that. Do **not** rely on
  `session.user.propertyName` for the active project (the JWT still holds the *first* property's
  name); use `useActiveProject().activeProject.name` instead.

---

## 9. Settings page — `app/settings/page.tsx` + property route

- The existing "Property" section edits the property at `session.user.propertyId`, which is now the
  **active** project — so it already edits the right one. Update the heading/subtext to make clear
  it's editing the *active project*, and show the active project name.
- Add a **"Projects"** section: list all `projects` from `useActiveProject()`, show which is active,
  allow switching, and include the same "Add project" form/modal as the switcher (reuse the POST).
- `app/api/settings/property/route.ts` needs **no change** (already keyed on
  `session.user.propertyId`).

---

## 10. Adding team users across projects (scope note)

`app/api/settings/users/route.ts` POST currently links a new user to `session.user.propertyId`
(the active project) via `properties: { create: { propertyId } }`. For this MVP that's acceptable:
a new teammate gets access to the project that was active when they were created.

**Known limitation to flag (future work, not MVP):** there is no UI to grant an existing user
access to *additional* projects. If needed later, add a `UserProperty` management UI and an
endpoint to create/delete `UserProperty` rows (owners only). Do **not** build this now unless asked.

Registration (`app/api/register/route.ts`) stays as-is — it creates the first org+property+link.

---

## 11. What NOT to touch

- The 48 API routes that use `session.user.propertyId` — unchanged (they inherit the active id).
- `prisma/schema.prisma` — **no migration** (M2M + propertyId columns already exist).
- `proxy.ts` middleware — unchanged. `/api/projects*` sits under `/api`, is NOT in the exclusion
  list, so it's protected by the session-cookie check — correct, these need a logged-in user.
- Cron/webhook/calling-server paths (`process-calls`, `process-messages`, `webhooks/*`,
  `calling-server/`) — they resolve `propertyId` from DB records, never from a user session, so
  multi-project doesn't affect them. AI calls already store `AiCall.propertyId` per lead.
- `types/next-auth.d.ts` — no required change (we override `propertyId` at runtime; type is still
  `string`).

---

## 12. Gotchas

- **Next 15 async APIs:** `await cookies()` and `await auth()`. Missing `await` = silent bugs.
- **Invalidate everything on switch:** `queryClient.invalidateQueries()` with no key. If you only
  invalidate `['projects']`, leads/analytics/etc. will show the *previous* project's cached data.
- **Cookie must be httpOnly + sameSite lax** so it rides along on same-site fetches and can't be
  read by JS. The server is the source of truth for "active project," not the client.
- **Tamper safety:** never trust the cookie's propertyId without the `UserProperty` membership
  check (done in both `requireSession` and `/switch`).
- **Seed on create must be awaited** (step 2) so the new project isn't empty when first opened.
- **Persistence across login:** the cookie has a 1-year maxAge, so the active project survives
  re-login. On a brand-new browser (no cookie), `requireSession` falls back to the JWT/first
  project — acceptable.

---

## 13. Execution order (do sequentially, verify after each)

1. `lib/access.ts` — rewrite `requireSession` (step 1). **Verify the app still works unchanged.**
2. `lib/validations/settings.ts` — add `projectCreateSchema` (step 4).
3. `app/api/projects/route.ts` — GET + POST (step 2).
4. `app/api/projects/switch/route.ts` — POST (step 3).
5. `components/active-project-provider.tsx` (step 5) + wire into `app/providers.tsx` (step 6).
6. `components/project-switcher.tsx` (step 7).
7. `components/sidebar.tsx` — render switcher (step 8).
8. `app/settings/page.tsx` — Projects section (step 9).

---

## 14. Test checklist

- [ ] Existing single-project account: dashboard/leads/analytics/campaigns/proposals/AI-calls all
      still load after the `requireSession` rewrite.
- [ ] Create a 2nd project via the switcher → it becomes active → its defaults (templates/platforms/
      campaigns) are seeded and visible.
- [ ] Add a lead in Project A, switch to Project B → B shows none of A's leads; every module is
      scoped to B. Switch back → A's data intact.
- [ ] Dashboard KPIs, analytics funnel/trend/sources, overdue widget all reflect the active project.
- [ ] Tamper: set the cookie to a propertyId you don't belong to → server ignores it and falls back
      (no cross-tenant data leak).
- [ ] New teammate created in Settings → can log in and sees the project active at creation time.
- [ ] Trigger an AI call from a lead in Project B → `AiCall.propertyId === B`; outcome write-back
      (PATCH `/api/ai-calls/[id]`) still succeeds and is scoped correctly.
- [ ] Log out / back in → active project persists (cookie).
- [ ] `npm run build` passes (no TS errors from the new context/types).

---

## 15. Rough size

~2 new API route files, 1 context provider, 1 switcher component, edits to `access.ts`,
`providers.tsx`, `sidebar.tsx`, `settings/page.tsx`, and one validation schema. **No migration,
no changes to the 48 scoped routes.** A focused day of work for Sonnet.
