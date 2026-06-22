'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { useParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeft, CheckSquare, Edit2, Loader2, MessageSquare, Plus, Save, Send, Square, X } from 'lucide-react'

import { DashboardLayout } from '@/components/dashboard-layout'
import { eventTypeLabels, formatCurrency, formatDate, leadStageLabels, sourceLabels } from '@/lib/format'

type Task = {
  id: string
  title: string
  description?: string | null
  dueDate?: string | null
  priority: string
  completed: boolean
  completedAt?: string | null
}

type LeadDetail = {
  id: string
  name: string
  email?: string | null
  phone: string
  eventType: string
  eventDate?: string | null
  guestCount?: number | null
  budgetMin?: string | number | null
  budgetMax?: string | number | null
  source: string
  stage: string
  leadScore: number
  notes?: string | null
  assignedTo?: { id: string; name: string; email: string } | null
  assignedToId?: string | null
  campaignId?: string | null
  campaign?: { id: string; name: string; type: string } | null
  activities: {
    id: string
    type: string
    content: string
    createdAt: string
    user?: { name: string; role: string }
  }[]
  proposals: {
    id: string
    title: string
    status: string
    amount?: string | number | null
    createdAt: string
  }[]
  tasks: Task[]
}

type OrgUser = {
  id: string
  name: string
  email: string
  role: string
}

async function fetchLead(id: string): Promise<{ lead: LeadDetail }> {
  const response = await fetch(`/api/leads/${id}`)
  if (!response.ok) throw new Error('Failed to load lead')
  return response.json()
}

async function fetchUsers(): Promise<{ users: OrgUser[] }> {
  const response = await fetch('/api/users')
  if (!response.ok) throw new Error('Failed to load users')
  return response.json()
}

const stages = Object.keys(leadStageLabels)

const priorityColors: Record<string, string> = {
  LOW: 'bg-muted text-muted-foreground',
  MEDIUM: 'bg-blue-500/10 text-blue-400',
  HIGH: 'bg-amber-500/10 text-amber-400',
  URGENT: 'bg-destructive/10 text-destructive',
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [stageNote, setStageNote] = useState('')
  const [note, setNote] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [taskPriority, setTaskPriority] = useState('MEDIUM')
  const [showWhatsApp, setShowWhatsApp] = useState(false)
  const [waMessage, setWaMessage] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['lead', params.id],
    queryFn: () => fetchLead(params.id),
  })

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  })

  const lead = data?.lead
  const users = usersData?.users ?? []

  const stageMutation = useMutation({
    mutationFn: async (stage: string) => {
      const response = await fetch(`/api/leads/${params.id}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, note: stageNote }),
      })
      if (!response.ok) throw new Error('Failed to update stage')
      return response.json()
    },
    onSuccess: () => {
      toast.success('Stage updated')
      setStageNote('')
      queryClient.invalidateQueries({ queryKey: ['lead', params.id] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: () => toast.error('Stage could not be updated'),
  })

  const editMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const response = await fetch(`/api/leads/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Failed to update lead')
      return response.json()
    },
    onSuccess: () => {
      toast.success('Lead updated')
      setIsEditing(false)
      queryClient.invalidateQueries({ queryKey: ['lead', params.id] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
    onError: () => toast.error('Lead could not be updated'),
  })

  const addTaskMutation = useMutation({
    mutationFn: async (payload: { title: string; dueDate?: string; priority: string }) => {
      const response = await fetch(`/api/leads/${params.id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Failed to create task')
      return response.json()
    },
    onSuccess: () => {
      toast.success('Task added')
      setTaskTitle('')
      setTaskDueDate('')
      setTaskPriority('MEDIUM')
      queryClient.invalidateQueries({ queryKey: ['lead', params.id] })
    },
    onError: () => toast.error('Task could not be added'),
  })

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true }),
      })
      if (!response.ok) throw new Error('Failed to complete task')
      return response.json()
    },
    onSuccess: () => {
      toast.success('Task completed')
      queryClient.invalidateQueries({ queryKey: ['lead', params.id] })
    },
    onError: () => toast.error('Could not complete task'),
  })

  const sendWhatsAppMutation = useMutation({
    mutationFn: async (payload: { message: string; phone: string }) => {
      const response = await fetch(`/api/leads/${params.id}/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error('Failed to send WhatsApp')
      return response.json()
    },
    onSuccess: () => {
      toast.success('WhatsApp sent')
      setShowWhatsApp(false)
      queryClient.invalidateQueries({ queryKey: ['lead', params.id] })
    },
    onError: () => toast.error('WhatsApp could not be sent'),
  })

  function handleEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    editMutation.mutate({
      name: form.get('name'),
      phone: form.get('phone'),
      email: form.get('email') || null,
      eventDate: form.get('eventDate') || null,
      guestCount: form.get('guestCount') ? Number(form.get('guestCount')) : null,
      budgetMin: form.get('budgetMin') ? Number(form.get('budgetMin')) : null,
      budgetMax: form.get('budgetMax') ? Number(form.get('budgetMax')) : null,
      notes: form.get('notes') || null,
      assignedToId: form.get('assignedToId') || null,
    })
  }

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!note.trim()) return

    const response = await fetch(`/api/leads/${params.id}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: note }),
    })

    if (!response.ok) {
      toast.error('Note could not be added')
      return
    }

    toast.success('Note added')
    setNote('')
    queryClient.invalidateQueries({ queryKey: ['lead', params.id] })
  }

  function handleAddTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!taskTitle.trim()) return
    addTaskMutation.mutate({
      title: taskTitle,
      dueDate: taskDueDate || undefined,
      priority: taskPriority,
    })
  }

  function handleSendWhatsApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!lead) return
    sendWhatsAppMutation.mutate({ message: waMessage, phone: lead.phone })
  }

  function openWhatsApp() {
    if (!lead) return
    setWaMessage(
      `Hi ${lead.name}! Thank you for your inquiry. We'd love to host your event at our venue. When would be a good time for a quick call? — NEXORA Team`
    )
    setShowWhatsApp(true)
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Link href="/leads" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to leads
        </Link>

        {isLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading lead...
          </div>
        )}

        {isError && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-destructive">Lead could not be loaded.</div>}

        {lead && (
          <>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-4xl font-bold text-foreground">{lead.name}</h1>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">{leadStageLabels[lead.stage]}</span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {eventTypeLabels[lead.eventType]} from {sourceLabels[lead.source]}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsEditing((prev) => !prev)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
                >
                  {isEditing ? <X className="h-4 w-4" /> : <Edit2 className="h-4 w-4" />}
                  {isEditing ? 'Cancel' : 'Edit'}
                </button>
                <Link
                  href={`/leads/${lead.id}/proposal/new`}
                  className="w-fit inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  <Plus className="h-4 w-4" />
                  Create Proposal
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <section className="xl:col-span-2 rounded-lg border border-border bg-card p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-xs text-muted-foreground">Lead Score</p>
                    <p className="text-2xl font-bold text-foreground">{lead.leadScore}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-xs text-muted-foreground">Guests</p>
                    <p className="text-2xl font-bold text-foreground">{lead.guestCount ?? 'Not set'}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-xs text-muted-foreground">Budget</p>
                    <p className="text-2xl font-bold text-foreground">{lead.budgetMax ? formatCurrency(Number(lead.budgetMax), 'lakhs') : 'Not set'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Phone</p>
                    <p className="font-medium text-foreground">{lead.phone}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Email</p>
                    <p className="font-medium text-foreground">{lead.email ?? 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Event Date</p>
                    <p className="font-medium text-foreground">{formatDate(lead.eventDate)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Assigned To</p>
                    <p className="font-medium text-foreground">{lead.assignedTo?.name ?? 'Unassigned'}</p>
                  </div>
                  {lead.campaign && (
                    <div>
                      <p className="text-muted-foreground">Campaign</p>
                      <p className="font-medium text-foreground flex items-center gap-2">
                        {lead.campaign.name}
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{lead.campaign.type.replaceAll('_', ' ')}</span>
                      </p>
                    </div>
                  )}
                </div>

                {isEditing && (
                  <form onSubmit={handleEdit} className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-4">
                    <h2 className="font-semibold text-foreground">Edit Lead Details</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">Name</span>
                        <input name="name" defaultValue={lead.name} required className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">Phone</span>
                        <input name="phone" defaultValue={lead.phone} required className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">Email</span>
                        <input name="email" type="email" defaultValue={lead.email ?? ''} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">Event Date</span>
                        <input name="eventDate" type="date" defaultValue={lead.eventDate ? new Date(lead.eventDate).toISOString().split('T')[0] : ''} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">Guest Count</span>
                        <input name="guestCount" type="number" min="1" defaultValue={lead.guestCount ?? ''} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-1">
                          <span className="text-xs font-medium text-muted-foreground">Budget Min (L)</span>
                          <input name="budgetMin" type="number" step="0.1" defaultValue={lead.budgetMin ? Number(lead.budgetMin) : ''} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-medium text-muted-foreground">Budget Max (L)</span>
                          <input name="budgetMax" type="number" step="0.1" defaultValue={lead.budgetMax ? Number(lead.budgetMax) : ''} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                        </label>
                      </div>
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground">Assign To</span>
                        <select name="assignedToId" defaultValue={lead.assignedToId ?? ''} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                          <option value="">Unassigned</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">Notes</span>
                      <textarea name="notes" defaultValue={lead.notes ?? ''} rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                    </label>
                    <button type="submit" disabled={editMutation.isPending} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                      <Save className="h-4 w-4" />
                      {editMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                  </form>
                )}

                <div className="rounded-lg border border-border p-4">
                  <h2 className="mb-3 font-semibold text-foreground">Stage</h2>
                  <div className="flex flex-col gap-3 md:flex-row">
                    <select
                      value={lead.stage}
                      onChange={(event) => stageMutation.mutate(event.target.value)}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                      {stages.map((stage) => (
                        <option key={stage} value={stage}>
                          {leadStageLabels[stage]}
                        </option>
                      ))}
                    </select>
                    <input
                      value={stageNote}
                      onChange={(event) => setStageNote(event.target.value)}
                      placeholder="Optional transition note"
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <h2 className="mb-3 font-semibold text-foreground">Proposals</h2>
                  <div className="space-y-3">
                    {lead.proposals.length === 0 && <p className="text-sm text-muted-foreground">No proposals yet.</p>}
                    {lead.proposals.map((proposal) => (
                      <Link key={proposal.id} href={`/proposals/${proposal.id}`} className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/50">
                        <div>
                          <p className="font-medium text-foreground">{proposal.title}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(proposal.createdAt)}</p>
                        </div>
                        <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">{proposal.status}</span>
                      </Link>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="mb-3 font-semibold text-foreground">Tasks</h2>
                  <form onSubmit={handleAddTask} className="mb-4 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder="New task title..."
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                    <input
                      type="date"
                      value={taskDueDate}
                      onChange={(e) => setTaskDueDate(e.target.value)}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                    <select
                      value={taskPriority}
                      onChange={(e) => setTaskPriority(e.target.value)}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                    <button
                      type="submit"
                      disabled={addTaskMutation.isPending || !taskTitle.trim()}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </button>
                  </form>
                  <div className="space-y-2">
                    {lead.tasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks yet.</p>}
                    {lead.tasks.map((task) => (
                      <div key={task.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                        <button
                          onClick={() => !task.completed && completeTaskMutation.mutate(task.id)}
                          disabled={task.completed || completeTaskMutation.isPending}
                          className="shrink-0 text-muted-foreground hover:text-primary disabled:cursor-default"
                        >
                          {task.completed ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                            {task.title}
                          </p>
                          {task.dueDate && (
                            <p className="text-xs text-muted-foreground">{formatDate(task.dueDate)}</p>
                          )}
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${priorityColors[task.priority] ?? 'bg-muted text-muted-foreground'}`}>
                          {task.priority}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-border bg-card p-6">
                <h2 className="mb-4 flex items-center gap-2 font-semibold text-foreground">
                  <MessageSquare className="h-4 w-4" />
                  Activity Timeline
                </h2>

                <div className="mb-4">
                  {!showWhatsApp ? (
                    <button
                      onClick={openWhatsApp}
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted w-full justify-center"
                    >
                      <Send className="h-4 w-4 text-green-500" />
                      Send via WhatsApp
                    </button>
                  ) : (
                    <form onSubmit={handleSendWhatsApp} className="space-y-2 rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">WhatsApp Message</span>
                        <button type="button" onClick={() => setShowWhatsApp(false)} className="text-muted-foreground hover:text-foreground">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <textarea
                        value={waMessage}
                        onChange={(e) => setWaMessage(e.target.value)}
                        rows={4}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                      <button
                        type="submit"
                        disabled={sendWhatsAppMutation.isPending}
                        className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                      >
                        <Send className="h-4 w-4" />
                        {sendWhatsAppMutation.isPending ? 'Sending...' : 'Send'}
                      </button>
                    </form>
                  )}
                </div>

                <form onSubmit={addNote} className="mb-5 space-y-3">
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Add a note..."
                    rows={3}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                  <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
                    <Save className="h-4 w-4" />
                    Add Note
                  </button>
                </form>
                <div className="space-y-4">
                  {lead.activities.map((activity) => (
                    <div key={activity.id} className="border-l-2 border-primary/30 pl-4">
                      <p className="text-sm font-medium text-foreground">{activity.content}</p>
                      <p className="text-xs text-muted-foreground">
                        {activity.user?.name ?? 'System'} · {formatDate(activity.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
