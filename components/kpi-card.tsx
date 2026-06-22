'use client'

import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'
import { useEffect, useState } from 'react'

interface KPICardProps {
  icon: LucideIcon
  label: string
  value: string | number
  change: string
  trend: 'up' | 'down'
  subtext: string
  color: 'primary' | 'accent' | 'secondary'
  clickable?: boolean
  onClick?: () => void
}

export function KPICard({ 
  icon: Icon, 
  label, 
  value, 
  change, 
  trend, 
  subtext, 
  color,
  clickable = false,
  onClick
}: KPICardProps) {
  const [isAnimating, setIsAnimating] = useState(true)

  useEffect(() => {
    setIsAnimating(true)
    const timer = setTimeout(() => setIsAnimating(false), 600)
    return () => clearTimeout(timer)
  }, [value])

  const colorClasses = {
    primary: 'text-primary',
    accent: 'text-accent',
    secondary: 'text-secondary',
  }

  const bgClasses = {
    primary: 'bg-primary/10',
    accent: 'bg-accent/10',
    secondary: 'bg-secondary/10',
  }

  return (
    <div 
      className={`bg-card rounded-xl border border-border p-6 transition-smooth hover-lift ${
        clickable ? 'cursor-pointer' : ''
      } animate-fade-in-up`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-lg ${bgClasses[color]} transition-smooth`}>
          <Icon className={`w-6 h-6 ${colorClasses[color]}`} />
        </div>
        <div className="flex items-center gap-1 px-2 py-1 bg-green-500/10 rounded-lg">
          {trend === 'up' ? (
            <TrendingUp className="w-4 h-4 text-green-500" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-500" />
          )}
          <span className={trend === 'up' ? 'text-green-500 text-sm font-semibold' : 'text-red-500 text-sm font-semibold'}>
            {change}
          </span>
        </div>
      </div>
      <h3 className="text-sm font-medium text-muted-foreground mb-1">{label}</h3>
      <p className={`text-3xl font-bold text-foreground mb-2 ${isAnimating ? 'animate-counter' : ''}`}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{subtext}</p>
    </div>
  )
}
