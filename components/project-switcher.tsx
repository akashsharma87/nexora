'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { Building2, Check, ChevronDown, Loader2, Plus, X } from 'lucide-react'

import { useActiveProject, useCreateProject } from '@/components/active-project-provider'
import { canManage } from '@/lib/roles'

export function ProjectSwitcher() {
  const { data: session } = useSession()
  const { projects, activeProject, isLoading, isSwitching, switchTo } = useActiveProject()
  const { createProject, isCreating } = useCreateProject()

  const [isOpen, setIsOpen] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const canAddProject = canManage(session?.user?.role)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleSwitch(propertyId: string) {
    if (propertyId === activeProject?.id) {
      setIsOpen(false)
      return
    }
    try {
      await switchTo(propertyId)
      setIsOpen(false)
    } catch {
      toast.error('Could not switch project')
    }
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    if (!name) return

    try {
      const { project } = await createProject({
        name,
        city: String(form.get('city') ?? ''),
        phone: String(form.get('phone') ?? ''),
        email: String(form.get('email') ?? ''),
      })
      toast.success(`"${project.name}" created`)
      setIsAddModalOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create project')
    }
  }

  const addProjectModal = isAddModalOpen
    ? createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">Add Project</h2>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3">
              <input
                name="name"
                required
                minLength={2}
                placeholder="Property name"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                name="city"
                placeholder="City"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  name="phone"
                  placeholder="Phone"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  name="email"
                  type="email"
                  placeholder="Email"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={isCreating}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Project
              </button>
            </form>
          </div>
        </div>,
        document.body
      )
    : null

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        disabled={isLoading}
        className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/10 px-3 py-2 text-left transition-colors hover:bg-sidebar-accent/20 disabled:opacity-60"
      >
        <Building2 size={16} className="flex-shrink-0 text-sidebar-foreground/70" />
        <span className="flex-1 min-w-0 truncate text-sm font-medium text-sidebar-foreground">
          {isLoading ? 'Loading…' : (activeProject?.name ?? 'Select project')}
        </span>
        {isSwitching ? (
          <Loader2 size={14} className="flex-shrink-0 animate-spin text-sidebar-foreground/60" />
        ) : (
          <ChevronDown size={14} className="flex-shrink-0 text-sidebar-foreground/60" />
        )}
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded-lg border border-sidebar-border bg-sidebar shadow-lg">
          <div className="max-h-64 overflow-y-auto p-1">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => handleSwitch(project.id)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-sidebar-foreground hover:bg-sidebar-accent/30"
              >
                <Check
                  size={14}
                  className={`flex-shrink-0 ${project.id === activeProject?.id ? 'opacity-100 text-primary' : 'opacity-0'}`}
                />
                <span className="flex-1 min-w-0 truncate">{project.name}</span>
              </button>
            ))}
          </div>

          {canAddProject && (
            <div className="border-t border-sidebar-border p-1">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false)
                  setIsAddModalOpen(true)
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-primary hover:bg-sidebar-accent/30"
              >
                <Plus size={14} className="flex-shrink-0" />
                Add project
              </button>
            </div>
          )}
        </div>
      )}

      {addProjectModal}
    </div>
  )
}
