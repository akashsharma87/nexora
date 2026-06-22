'use client'

import { X, Lightbulb, TrendingUp, AlertCircle, Zap } from 'lucide-react'
import { useState } from 'react'

interface SmartInsight {
  id: string
  type: 'opportunity' | 'alert' | 'tip' | 'achievement'
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
}

interface SmartInsightsProps {
  insights: SmartInsight[]
}

export function SmartInsights({ insights }: SmartInsightsProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visibleInsights = insights.filter((insight) => !dismissed.has(insight.id))

  const handleDismiss = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id))
  }

  if (visibleInsights.length === 0) return null

  const getIcon = (type: SmartInsight['type']) => {
    const iconClasses = 'w-5 h-5'
    switch (type) {
      case 'opportunity':
        return <TrendingUp className={`${iconClasses} text-green-500`} />
      case 'alert':
        return <AlertCircle className={`${iconClasses} text-orange-500`} />
      case 'tip':
        return <Lightbulb className={`${iconClasses} text-blue-500`} />
      case 'achievement':
        return <Zap className={`${iconClasses} text-yellow-500`} />
      default:
        return <Lightbulb className={`${iconClasses} text-blue-500`} />
    }
  }

  const getBgColor = (type: SmartInsight['type']) => {
    switch (type) {
      case 'opportunity':
        return 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
      case 'alert':
        return 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800'
      case 'tip':
        return 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
      case 'achievement':
        return 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800'
      default:
        return 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
    }
  }

  return (
    <div className="space-y-3">
      {visibleInsights.map((insight, index) => (
        <div
          key={insight.id}
          className={`border rounded-lg p-4 flex items-start gap-3 animate-fade-in-up transition-smooth hover-lift ${getBgColor(
            insight.type
          )}`}
          style={{ animationDelay: `${index * 0.1}s` }}
        >
          <div className="flex-shrink-0 mt-0.5">{getIcon(insight.type)}</div>

          <div className="flex-1">
            <h4 className="font-semibold text-sm text-foreground">{insight.title}</h4>
            <p className="text-sm text-muted-foreground mt-1">{insight.description}</p>

            {insight.action && (
              <button
                onClick={insight.action.onClick}
                className="mt-2 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                {insight.action.label} →
              </button>
            )}
          </div>

          <button
            onClick={() => handleDismiss(insight.id)}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
