'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeft, Upload } from 'lucide-react'

import { DashboardLayout } from '@/components/dashboard-layout'

type ImportRow = {
  name: string
  phone: string
  email?: string
  eventType: string
  eventDate?: string
  guestCount?: string
  budgetMin?: string
  budgetMax?: string
  source: string
  notes?: string
}

type ImportResult = {
  created: number
  errors: string[]
}

function parseCSV(raw: string): ImportRow[] {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const rows: ImportRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim())
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => {
      obj[h] = values[idx] ?? ''
    })
    rows.push({
      name: obj['name'] ?? '',
      phone: obj['phone'] ?? '',
      email: obj['email'] || undefined,
      eventType: obj['eventtype'] ?? obj['event_type'] ?? obj['eventType'] ?? '',
      eventDate: (obj['eventdate'] ?? obj['event_date'] ?? obj['eventDate']) || undefined,
      guestCount: (obj['guestcount'] ?? obj['guest_count'] ?? obj['guestCount']) || undefined,
      budgetMin: (obj['budgetmin'] ?? obj['budget_min'] ?? obj['budgetMin']) || undefined,
      budgetMax: (obj['budgetmax'] ?? obj['budget_max'] ?? obj['budgetMax']) || undefined,
      source: obj['source'] ?? '',
      notes: obj['notes'] || undefined,
    })
  }

  return rows
}

export default function ImportLeadsPage() {
  const [csvText, setCsvText] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)

  const importMutation = useMutation({
    mutationFn: async (rows: ImportRow[]) => {
      const response = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      if (!response.ok) throw new Error('Import failed')
      return response.json() as Promise<ImportResult>
    },
    onSuccess: (data) => {
      setResult(data)
      if (data.created > 0) {
        toast.success(`${data.created} lead(s) imported`)
      }
      if (data.errors.length > 0 && data.created === 0) {
        toast.error('Import completed with errors')
      }
    },
    onError: () => toast.error('Import could not be completed'),
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCsvText((ev.target?.result as string) ?? '')
    }
    reader.readAsText(file)
  }

  function handleImport() {
    const rows = parseCSV(csvText)
    if (rows.length === 0) {
      toast.error('No rows found. Check the CSV format.')
      return
    }
    if (rows.length > 200) {
      toast.error('Maximum 200 rows per import.')
      return
    }
    setResult(null)
    importMutation.mutate(rows)
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl space-y-6">
        <Link href="/leads" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to leads
        </Link>

        <div>
          <h1 className="text-4xl font-bold text-foreground">Import Leads</h1>
          <p className="text-muted-foreground mt-1">Paste CSV data or upload a .csv file to bulk-import historical leads.</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 space-y-3">
          <h2 className="font-semibold text-foreground">CSV Format</h2>
          <p className="text-sm text-muted-foreground">First row must be headers. Required columns: <span className="font-mono text-foreground">name, phone, eventType, source</span>. All other columns are optional.</p>
          <div className="rounded-lg bg-muted/50 p-3 font-mono text-xs text-foreground overflow-x-auto">
            name,phone,email,eventType,eventDate,guestCount,budgetMin,budgetMax,source,notes
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-foreground mb-1">Valid eventType values</p>
              <ul className="space-y-0.5 text-muted-foreground font-mono text-xs">
                <li>SOCIAL_EVENTS</li>
                <li>CORPORATE_EVENTS</li>
                <li>BIRTHDAY_SOCIAL</li>
                <li>PROMOTIONAL_EVENTS</li>
                <li>ENTERTAINMENT_EVENTS</li>
                <li>SEASONAL_THEMATIC</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Valid source values</p>
              <ul className="space-y-0.5 text-muted-foreground font-mono text-xs">
                <li>WEDMEGOOD, WEDDINGZ, VENUELOOK</li>
                <li>WEDDINGBAZAAR, GOOGLE, META</li>
                <li>JUSTDIAL, WALK_IN, REFERRAL</li>
                <li>PHONE, DIRECT, OTHER</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground cursor-pointer hover:bg-muted/80">
              <Upload className="h-4 w-4" />
              Upload .csv file
              <input type="file" accept=".csv,text/csv" onChange={handleFileChange} className="sr-only" />
            </label>
            <span className="text-sm text-muted-foreground">or paste below</span>
          </div>

          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={`name,phone,email,eventType,source\nRahul Sharma,9999999999,rahul@example.com,SOCIAL_EVENTS,GOOGLE`}
            rows={10}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
          />

          <button
            onClick={handleImport}
            disabled={importMutation.isPending || !csvText.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60 hover:opacity-90"
          >
            <Upload className="h-4 w-4" />
            {importMutation.isPending ? 'Importing...' : 'Import'}
          </button>
        </div>

        {result && (
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <p className="font-semibold text-foreground">
              {result.created} lead(s) imported successfully.{result.errors.length > 0 ? ` ${result.errors.length} error(s).` : ''}
            </p>
            {result.errors.length > 0 && (
              <ul className="space-y-1 text-sm text-destructive">
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
