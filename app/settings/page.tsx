'use client'

import { FormEvent, useState } from 'react'
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { AlertTriangle, Building2, Check, Copy, Eye, EyeOff, Loader2, Plus, RefreshCw, Users, UserCircle } from 'lucide-react'

import { DashboardLayout } from '@/components/dashboard-layout'
import { useActiveProject, useCreateProject } from '@/components/active-project-provider'
import { canManage } from '@/lib/roles'
import { PRIYA_COUNTRY_SUGGESTIONS } from '@/lib/priya-country-suggestions'

type Property = {
  id: string
  name: string
  address?: string | null
  city?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  websiteUrl?: string | null
  organization?: { name: string }
}

type User = {
  id: string
  name: string
  email: string
  role: string
  phone?: string | null
  isActive: boolean
}

type Profile = {
  id: string
  name: string
  email: string
  role: string
  staffTag?: string | null
  phone?: string | null
}

type MogulUser = {
  id: string
  name: string
  email: string
  staffTag: string | null
  isActive: boolean
  phone?: string | null
  password: string | null
}

const staffTagLabels: Record<string, string> = {
  MOGUL_1: 'Mogul-1',
  MOGUL_2: 'Mogul-2',
  MOGUL_3: 'Mogul-3',
}

async function apiGet<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to load ${url}`)
  return response.json()
}

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const { projects, activeId, isSwitching, switchTo } = useActiveProject()
  const { createProject, isCreating } = useCreateProject()
  const canAddProject = canManage(session?.user?.role)

  const [propertyQuery, usersQuery, profileQuery, mogulUsersQuery] = useQueries({
    queries: [
      { queryKey: ['settings-property'], queryFn: () => apiGet<{ property: Property }>('/api/settings/property') },
      { queryKey: ['settings-users'], queryFn: () => apiGet<{ users: User[] }>('/api/settings/users') },
      { queryKey: ['settings-profile'], queryFn: () => apiGet<{ user: Profile }>('/api/settings/profile') },
      {
        queryKey: ['settings-mogul-users', activeId],
        queryFn: () => apiGet<{ users: MogulUser[] }>('/api/settings/mogul-users'),
        enabled: canAddProject,
      },
    ],
  })

  const updateProperty = useMutation({
    mutationFn: async (payload: unknown) => {
      const response = await fetch('/api/settings/property', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Failed to update property')
      return response.json()
    },
    onSuccess: () => {
      toast.success('Property updated')
      queryClient.invalidateQueries({ queryKey: ['settings-property'] })
    },
    onError: () => toast.error('Property could not be updated'),
  })

  const addUser = useMutation({
    mutationFn: async (payload: unknown) => {
      const response = await fetch('/api/settings/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Failed to add user')
      return response.json()
    },
    onSuccess: () => {
      toast.success('User added')
      queryClient.invalidateQueries({ queryKey: ['settings-users'] })
    },
    onError: () => toast.error('User could not be added. Only owners can add users.'),
  })

  const updateUser = useMutation({
    mutationFn: async (payload: unknown) => {
      const response = await fetch('/api/settings/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Failed to update user')
      return response.json()
    },
    onSuccess: () => {
      toast.success('User updated')
      queryClient.invalidateQueries({ queryKey: ['settings-users'] })
    },
    onError: () => toast.error('User could not be updated'),
  })

  const updateProfile = useMutation({
    mutationFn: async (payload: { name: string; phone: string }) => {
      const response = await fetch('/api/settings/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Failed to update profile')
      return response.json()
    },
    onSuccess: () => {
      toast.success('Profile updated')
      queryClient.invalidateQueries({ queryKey: ['settings-profile'] })
    },
    onError: () => toast.error('Profile could not be updated'),
  })

  const regenerateMogulPassword = useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch('/api/settings/mogul-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (!response.ok) throw new Error('Failed to regenerate password')
      return response.json()
    },
    onSuccess: () => {
      toast.success('Password regenerated')
      queryClient.invalidateQueries({ queryKey: ['settings-mogul-users'] })
    },
    onError: () => toast.error('Password could not be regenerated'),
  })

  // Projects created before the mogul-seat feature shipped don't have them yet
  // (auto-provisioning only fires for brand-new projects) — this backfills the
  // active project via the existing idempotent seed-defaults endpoint.
  const provisionMoguls = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/setup/seed-defaults', { method: 'POST' })
      if (!response.ok) throw new Error('Failed to set up team seats')
      return response.json()
    },
    onSuccess: () => {
      toast.success('Internet Moguls team seats created')
      queryClient.invalidateQueries({ queryKey: ['settings-mogul-users'] })
    },
    onError: () => toast.error('Could not set up team seats'),
  })

  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set())
  function toggleRevealed(id: string) {
    setRevealedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  }

  function submitProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    updateProperty.mutate({
      name: form.get('name'),
      address: form.get('address'),
      city: form.get('city'),
      country: form.get('country'),
      phone: form.get('phone'),
      email: form.get('email'),
      websiteUrl: form.get('websiteUrl'),
    })
  }

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    if (!name) return
    const phone = String(form.get('phone') ?? '').trim()
    updateProfile.mutate({ name, phone })
  }

  function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    addUser.mutate({
      name: form.get('name'),
      email: form.get('email'),
      password: form.get('password'),
      role: form.get('role'),
      phone: form.get('phone'),
    })
    event.currentTarget.reset()
  }

  async function handleSwitchProject(propertyId: string) {
    if (propertyId === activeId) return
    try {
      await switchTo(propertyId)
      toast.success('Switched project')
    } catch {
      toast.error('Could not switch project')
    }
  }

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const name = String(data.get('name') ?? '').trim()
    if (!name) return

    try {
      const { project } = await createProject({
        name,
        city: String(data.get('city') ?? ''),
        country: String(data.get('country') ?? ''),
        phone: String(data.get('phone') ?? ''),
        email: String(data.get('email') ?? ''),
        websiteUrl: String(data.get('websiteUrl') ?? ''),
      })
      toast.success(`"${project.name}" created`)
      form.reset()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create project')
    }
  }

  const property = propertyQuery.data?.property
  const users = usersQuery.data?.users ?? []
  const profile = profileQuery.data?.user
  const mogulUsers = mogulUsersQuery.data?.users ?? []
  const activeProjectName = projects.find((project) => project.id === activeId)?.name

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage projects, property profile, and team access for the current organization.
          </p>
        </div>

        {(propertyQuery.isLoading || usersQuery.isLoading) && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading settings...
          </div>
        )}

        {profile && (
          <section className="rounded-lg border border-border bg-card p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UserCircle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">My Profile</h2>
                <p className="text-sm text-muted-foreground">
                  {profile.email}
                  {profile.staffTag && (
                    <span className="ml-2 inline-block rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                      {staffTagLabels[profile.staffTag] ?? profile.staffTag}
                    </span>
                  )}
                </p>
              </div>
            </div>
            {!profile.phone && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                  No WhatsApp number on file — you will not get notified when a task is assigned to you. Add your number below.
                </span>
              </div>
            )}
            <form onSubmit={submitProfile} className="flex flex-col sm:flex-row gap-3">
              <input
                name="name"
                defaultValue={profile.name}
                required
                minLength={2}
                placeholder="Name"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                name="phone"
                defaultValue={profile.phone ?? ''}
                placeholder="WhatsApp number"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <button
                disabled={updateProfile.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {updateProfile.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </button>
            </form>
            {profile.staffTag && (
              <p className="mt-2 text-xs text-muted-foreground">
                Your {staffTagLabels[profile.staffTag] ?? profile.staffTag} tag stays the same even if you change your display name.
              </p>
            )}
          </section>
        )}

        <section className="rounded-lg border border-border bg-card p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Projects</h2>
              <p className="text-sm text-muted-foreground">
                Every property you have access to. Switch the active one, or add another.
              </p>
            </div>
          </div>

          <div className="space-y-2 mb-6">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => handleSwitchProject(project.id)}
                disabled={isSwitching}
                className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors disabled:opacity-60 ${
                  project.id === activeId
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <div>
                  <p className="font-medium text-foreground">{project.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {project.organizationName}
                    {project.city ? ` · ${project.city}` : ''}
                    {project.country ? ` · ${project.country}` : ''}
                  </p>
                </div>
                {project.id === activeId && <Check className="h-4 w-4 flex-shrink-0 text-primary" />}
              </button>
            ))}
          </div>

          {canAddProject && (
            <form onSubmit={submitProject} className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-border pt-5">
              <input name="name" required minLength={2} placeholder="New property name" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <input name="city" placeholder="City" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <input name="country" placeholder="Country (e.g. India)" defaultValue="India" list="priya-country-suggestions" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <input name="phone" placeholder="Phone" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <input name="email" type="email" placeholder="Email" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <input name="websiteUrl" type="url" placeholder="Website (e.g. https://venue.com)" className="md:col-span-2 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <datalist id="priya-country-suggestions">
                {PRIYA_COUNTRY_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <p className="md:col-span-2 -mt-1 text-xs text-muted-foreground">
                Country determines Priya&apos;s default language: Hinglish (India), Indian-accented
                English (nearby countries with Indian-diaspora clientele), or neutral English (elsewhere).
                Website is used to build Priya&apos;s Knowledge Base about the venue.
              </p>
              <button
                type="submit"
                disabled={isCreating}
                className="md:col-span-2 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add Project
              </button>
            </form>
          )}
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <section className="rounded-lg border border-border bg-card p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Property</h2>
                <p className="text-sm text-muted-foreground">
                  Editing <span className="font-medium text-foreground">{activeProjectName ?? property?.name}</span>
                  {property?.organization?.name ? ` · ${property.organization.name}` : ''}
                </p>
              </div>
            </div>

            {property && (
              <form onSubmit={submitProperty} className="space-y-4">
                <input name="name" defaultValue={property.name} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                <input name="address" defaultValue={property.address ?? ''} placeholder="Address" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input name="city" defaultValue={property.city ?? ''} placeholder="City" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  <input name="country" defaultValue={property.country ?? 'India'} placeholder="Country" list="priya-country-suggestions" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  <input name="phone" defaultValue={property.phone ?? ''} placeholder="Phone" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  <input name="email" defaultValue={property.email ?? ''} placeholder="Email" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
                <input
                  name="websiteUrl"
                  type="url"
                  defaultValue={property.websiteUrl ?? ''}
                  placeholder="Website (e.g. https://venue.com)"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Country determines Priya&apos;s (AI calling) default language: Hinglish (India),
                  Indian-accented English (nearby countries with Indian-diaspora clientele), or neutral
                  English (elsewhere). Priya uses the website to build a Knowledge Base so she can
                  answer questions about the venue — see the Knowledge Base page to build/edit it.
                </p>
                <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Save Property</button>
              </form>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Users</h2>
                <p className="text-sm text-muted-foreground">Owner, manager, and executive roles.</p>
              </div>
            </div>

            <form onSubmit={submitUser} className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
              <input name="name" required placeholder="Name" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <input name="email" type="email" required placeholder="Email" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <input name="password" type="password" required placeholder="Password" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <select name="role" className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {['OWNER', 'MANAGER', 'EXECUTIVE'].map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <input name="phone" placeholder="Phone" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                <Plus className="h-4 w-4" />
                Add User
              </button>
            </form>

            <div className="space-y-3">
              {users.map((user) => (
                <div key={user.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="font-medium text-foreground">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={user.role}
                      onChange={(event) => updateUser.mutate({ id: user.id, role: event.target.value })}
                      className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                    >
                      {['OWNER', 'MANAGER', 'EXECUTIVE'].map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => updateUser.mutate({ id: user.id, isActive: !user.isActive })}
                      className="rounded-lg border border-border px-3 py-1 text-xs text-foreground hover:bg-muted"
                    >
                      {user.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {canAddProject && !mogulUsersQuery.isLoading && (
          <section className="rounded-lg border border-border bg-card p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Internet Moguls Team</h2>
                <p className="text-sm text-muted-foreground">
                  Auto-provisioned login seats for <span className="font-medium text-foreground">{activeProjectName ?? property?.name}</span> — share these credentials with the assigned teammates. Priya (AI caller) assigns follow-up tasks to them automatically.
                </p>
              </div>
            </div>

            {mogulUsers.length === 0 && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-4">
                <p className="text-sm text-muted-foreground">
                  This project was created before team seats existed — set them up to start getting Priya's follow-up tasks assigned.
                </p>
                <button
                  onClick={() => provisionMoguls.mutate()}
                  disabled={provisionMoguls.isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60 flex-shrink-0"
                >
                  {provisionMoguls.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Set Up Now
                </button>
              </div>
            )}

            <div className="space-y-3">
              {mogulUsers.map((mogul) => {
                const isRevealed = revealedIds.has(mogul.id)
                return (
                  <div key={mogul.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">{mogul.name}</p>
                          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
                            {mogul.staffTag ? staffTagLabels[mogul.staffTag] ?? mogul.staffTag : ''}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{mogul.email}</p>
                        {!mogul.phone && (
                          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3" />
                            No WhatsApp number — task notifications won't reach them until they add one in their profile.
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          if (window.confirm(`Generate a new password for ${mogul.name}? The old one will stop working immediately.`)) {
                            regenerateMogulPassword.mutate(mogul.id)
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1 text-xs text-foreground hover:bg-muted flex-shrink-0"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Regenerate
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="flex-1 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs">
                        {isRevealed ? mogul.password ?? '—' : '••••••••••••'}
                      </code>
                      <button
                        onClick={() => toggleRevealed(mogul.id)}
                        className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted"
                        title={isRevealed ? 'Hide password' : 'Reveal password'}
                      >
                        {isRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => mogul.password && copyToClipboard(mogul.password, 'Password')}
                        disabled={!mogul.password}
                        className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40"
                        title="Copy password"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </DashboardLayout>
  )
}
