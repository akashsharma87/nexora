'use client'

import { useState } from 'react'
import { LucideIcon, RotateCcw, RotateCw } from 'lucide-react'

import { KPICard } from '@/components/kpi-card'

interface FlipKpiCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  change: string
  trend: 'up' | 'down'
  subtext: string
  color: 'primary' | 'accent' | 'secondary'
  distribution: { tab: string; count: number }[]
  backTitle?: string
}

// Front face is the normal KPICard (click to flip). Back face shows the same
// total broken down by sheet-tab/campaign (e.g. "Presidential Suite: 45",
// "Kitty Party: 60") — reuses the tab-count data already powering the
// "Leads by Campaign" widget further down the dashboard.
export function FlipKpiCard({
  icon,
  label,
  value,
  change,
  trend,
  subtext,
  color,
  distribution,
  backTitle,
}: FlipKpiCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)
  const sorted = [...distribution].sort((a, b) => b.count - a.count)
  const total = sorted.reduce((sum, row) => sum + row.count, 0)

  return (
    <div className="perspective-distant">
      <div
        className={`relative transition-transform duration-500 transform-3d ${
          isFlipped ? 'rotate-y-180' : ''
        }`}
      >
        <div className="backface-hidden relative">
          <KPICard
            icon={icon}
            label={label}
            value={value}
            change={change}
            trend={trend}
            subtext={subtext}
            color={color}
            clickable
            onClick={() => setIsFlipped(true)}
          />
          <div
            className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-1 text-muted-foreground/50"
            title="Click to see the breakdown by campaign"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </div>
        </div>

        <div
          className="absolute inset-0 backface-hidden rotate-y-180 bg-card rounded-xl border border-border p-5 flex flex-col cursor-pointer animate-fade-in-up"
          onClick={() => setIsFlipped(false)}
        >
          <div className="flex items-center justify-between mb-3 flex-shrink-0">
            <h3 className="text-sm font-medium text-muted-foreground">{backTitle ?? `${label} by campaign`}</h3>
            <RotateCcw className="h-3.5 w-3.5 text-muted-foreground/50" />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-1">
            {sorted.length === 0 && (
              <p className="text-xs text-muted-foreground">No campaign-tagged leads yet.</p>
            )}
            {sorted.map((row) => {
              const percentage = total > 0 ? Math.round((row.count / total) * 100) : 0
              return (
                <div key={row.tab}>
                  <div className="flex justify-between items-center gap-2 mb-1">
                    <span className="text-xs text-muted-foreground truncate" title={row.tab}>
                      {row.tab}
                    </span>
                    <span className="text-xs font-semibold text-foreground flex-shrink-0">{row.count}</span>
                  </div>
                  <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
