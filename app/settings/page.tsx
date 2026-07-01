'use client'

import { FormEvent } from 'react'
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { Building2, Check, Loader2, Plus, Users } from 'lucide-react'

import { DashboardLayout } from '@/components/dashboard-layout'
import { useActiveProject, useCreateProject } from '@/components/active-project-provider'
import { canManage } from '@/lib/roles'

type Property = {
  id: string
  name: string
  address?: string | null
  city?: string | null
  phone?: string | null
  email?: string | null
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

  const [propertyQuery, usersQuery] = useQueries({
    queries: [
      { queryKey: ['settings-property'], queryFn: () => apiGet<{ property: Property }>('/api/settings/property') },
      { queryKey: ['settings-users'], queryFn: () => apiGet<{ users: User[] }>('/api/settings/users') },
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

  function submitProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    updateProperty.mutate({
      name: form.get('name'),
      address: form.get('address'),
      city: form.get('city'),
      phone: form.get('phone'),
      email: form.get('email'),
    })
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
        phone: String(data.get('phone') ?? ''),
        email: String(data.get('email') ?? ''),
      })
      toast.success(`"${project.name}" created`)
      form.reset()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create project')
    }
  }

  const property = propertyQuery.data?.property
  const users = usersQuery.data?.users ?? []
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
              <input name="phone" placeholder="Phone" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <input name="email" type="email" placeholder="Email" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input name="city" defaultValue={property.city ?? ''} placeholder="City" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  <input name="phone" defaultValue={property.phone ?? ''} placeholder="Phone" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  <input name="email" defaultValue={property.email ?? ''} placeholder="Email" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
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
      </div>
    </DashboardLayout>
  )
}
