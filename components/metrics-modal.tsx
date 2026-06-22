'use client'

import { X, TrendingUp, TrendingDown, Calendar } from 'lucide-react'

interface MetricsModalProps {
  title: string
  metric: string
  previousValue: string
  change: number
  timeframe: string
  details: {
    label: string
    value: string
    subtext?: string
  }[]
  onClose: () => void
}

export function MetricsModal({ title, metric, previousValue, change, timeframe, details, onClose }: MetricsModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg border border-border max-w-md w-full p-6 animate-fade-in-up">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="mb-6">
          <div className="flex items-end gap-2 mb-2">
            <div className="text-4xl font-bold text-foreground">{metric}</div>
            <div className={`flex items-center gap-1 px-2 py-1 rounded ${change >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
              {change >= 0 ? (
                <TrendingUp className="w-4 h-4 text-green-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500" />
              )}
              <span className={`text-sm font-semibold ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {change > 0 ? '+' : ''}{change}%
              </span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Previous: <span className="font-semibold text-foreground">{previousValue}</span>
          </p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
            <Calendar className="w-3 h-3" />
            {timeframe}
          </div>
        </div>

        <div className="space-y-3 mb-6">
          {details.map((detail, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">{detail.label}</span>
              <div className="text-right">
                <p className="font-semibold text-foreground">{detail.value}</p>
                {detail.subtext && <p className="text-xs text-muted-foreground">{detail.subtext}</p>}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}
