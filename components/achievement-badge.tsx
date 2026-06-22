'use client'

import { Lock, Zap, Trophy, Target, Flame, Award } from 'lucide-react'

interface AchievementBadgeProps {
  type: 'firstLead' | 'hotStreak' | 'superClose' | 'budgetMaster' | 'whatsappWizard' | 'topPerformer'
  unlocked: boolean
  progress?: number
  maxProgress?: number
}

const achievements = {
  firstLead: {
    name: 'First Contact',
    description: 'Add your first lead',
    icon: Target,
    color: 'from-blue-500 to-cyan-500',
  },
  hotStreak: {
    name: 'Hot Streak',
    description: '5 leads in 24 hours',
    icon: Flame,
    color: 'from-orange-500 to-red-500',
  },
  superClose: {
    name: 'Super Closer',
    description: '10 bookings confirmed',
    icon: Trophy,
    color: 'from-yellow-500 to-amber-500',
  },
  budgetMaster: {
    name: 'Budget Master',
    description: 'Optimize 3 campaigns',
    icon: Zap,
    color: 'from-purple-500 to-pink-500',
  },
  whatsappWizard: {
    name: 'WhatsApp Wizard',
    description: 'Send 100 automated messages',
    icon: Award,
    color: 'from-green-500 to-emerald-500',
  },
  topPerformer: {
    name: 'Top Performer',
    description: 'All achievements unlocked',
    icon: Trophy,
    color: 'from-indigo-500 to-purple-500',
  },
}

export function AchievementBadge({ type, unlocked, progress = 0, maxProgress = 100 }: AchievementBadgeProps) {
  const achievement = achievements[type]
  const Icon = achievement.icon
  const progressPercent = (progress / maxProgress) * 100

  return (
    <div className={`relative group ${unlocked ? 'animate-unlock' : ''}`}>
      <div
        className={`w-20 h-20 rounded-full flex items-center justify-center transition-smooth ${
          unlocked
            ? `bg-gradient-to-br ${achievement.color} shadow-lg hover-scale`
            : 'bg-muted border-2 border-border'
        } relative`}
      >
        {!unlocked && (
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent border-r-accent" />
        )}
        
        <Icon className={`w-8 h-8 ${unlocked ? 'text-white' : 'text-muted-foreground'}`} />
        
        {!unlocked && maxProgress > 0 && (
          <div className="absolute inset-0 rounded-full flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-border"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={`${(progressPercent / 100) * 283} 283`}
                className="text-accent transition-all"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-foreground text-background rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
        <div className="font-semibold">{achievement.name}</div>
        <div className="text-background/80 text-xs mt-1">{achievement.description}</div>
        {!unlocked && maxProgress > 0 && (
          <div className="text-background/70 text-xs mt-2">{progress}/{maxProgress}</div>
        )}
      </div>
    </div>
  )
}
