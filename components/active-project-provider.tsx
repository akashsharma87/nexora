'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export type Project = {
  id: string
  name: string
  city?: string | null
  country?: string | null
  organizationName: string
}

type ProjectsResponse = {
  projects: Project[]
  activeId: string
}

export type NewProjectInput = {
  name: string
  city?: string
  country?: string
  phone?: string
  email?: string
  websiteUrl?: string
}

type CreateProjectResponse = {
  project: { id: string; name: string }
}

type ActiveProjectContextValue = {
  projects: Project[]
  activeId: string | null
  activeProject: Project | null
  isLoading: boolean
  isSwitching: boolean
  switchTo: (propertyId: string) => Promise<void>
}

const ActiveProjectContext = createContext<ActiveProjectContextValue | null>(null)

async function fetchProjects(): Promise<ProjectsResponse> {
  const response = await fetch('/api/projects')
  if (!response.ok) throw new Error('Failed to load projects')
  return response.json()
}

async function switchProject(propertyId: string): Promise<void> {
  const response = await fetch('/api/projects/switch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ propertyId }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error ?? 'Failed to switch project')
  }
}

async function createProject(input: NewProjectInput): Promise<CreateProjectResponse> {
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error ?? 'Failed to create project')
  }
  return response.json()
}

export function ActiveProjectProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { status } = useSession()

  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
    // Skip on /login, /register, etc. — there's no session to scope projects to yet.
    enabled: status === 'authenticated',
  })

  const switchMutation = useMutation({
    mutationFn: switchProject,
    onSuccess: async () => {
      // Data for the previous project is now stale everywhere — drop the
      // entire cache rather than just ['projects'], then refresh any server
      // components so they re-read the newly active property too.
      await queryClient.invalidateQueries()
      router.refresh()
    },
  })

  const projects = data?.projects ?? []
  const activeId = data?.activeId ?? null
  const activeProject = projects.find((project) => project.id === activeId) ?? null

  const value: ActiveProjectContextValue = {
    projects,
    activeId,
    activeProject,
    isLoading,
    isSwitching: switchMutation.isPending,
    switchTo: (propertyId) => switchMutation.mutateAsync(propertyId),
  }

  return <ActiveProjectContext.Provider value={value}>{children}</ActiveProjectContext.Provider>
}

export function useActiveProject() {
  const context = useContext(ActiveProjectContext)
  if (!context) {
    throw new Error('useActiveProject must be used within an ActiveProjectProvider')
  }
  return context
}

// Shared "create a new project" mutation — used by both the sidebar switcher
// and the Settings page so the invalidate-everything-and-refresh behavior
// (new project data must be visible immediately) only lives in one place.
export function useCreateProject() {
  const queryClient = useQueryClient()
  const router = useRouter()

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      router.refresh()
    },
  })

  return {
    createProject: mutation.mutateAsync,
    isCreating: mutation.isPending,
  }
}
