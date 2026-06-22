'use client'

import { Phone, MessageSquare, Mail, MoreHorizontal, Star, TrendingUp } from 'lucide-react'
import { useState } from 'react'

interface LeadCardProps {
  id: string
  name: string
  email: string
  phone: string
  eventType: string
  eventDate: string
  guestCount: number
  budget: string
  status: 'NEW' | 'WARM' | 'HOT'
  leadScore: number
  source: string
  onQuickAction?: (action: string) => void
}

export function LeadCard({
  id,
  name,
  email,
  phone,
  eventType,
  eventDate,
  guestCount,
  budget,
  status,
  leadScore,
  source,
  onQuickAction,
}: LeadCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isFavorited, setIsFavorited] = useState(false)

  const statusColor = {
    NEW: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400',
    WARM: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-400',
    HOT: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400',
  }

  const scoreColor = leadScore >= 80 ? 'text-green-500' : leadScore >= 50 ? 'text-orange-500' : 'text-gray-500'

  return (
    <div
      className={`bg-card rounded-lg border border-border p-5 transition-smooth hover-lift cursor-pointer group ${
        isExpanded ? 'ring-2 ring-primary' : ''
      }`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-foreground text-lg">{name}</h3>
            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColor[status]}`}>
              {status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{eventType}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 px-2 py-1 rounded ${scoreColor}`}>
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm font-semibold">{leadScore}</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setIsFavorited(!isFavorited)
            }}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <Star className={`w-4 h-4 ${isFavorited ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground'}`} />
          </button>
        </div>
      </div>

      {/* Summary info */}
      <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
        <div className="bg-muted/50 rounded p-2">
          <span className="text-muted-foreground text-xs">Guests</span>
          <p className="font-semibold text-foreground">{guestCount}</p>
        </div>
        <div className="bg-muted/50 rounded p-2">
          <span className="text-muted-foreground text-xs">Budget</span>
          <p className="font-semibold text-foreground">{budget}</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onQuickAction?.('call')
          }}
          className="flex-1 px-3 py-2 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1"
        >
          <Phone className="w-3 h-3" />
          Call
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onQuickAction?.('whatsapp')
          }}
          className="flex-1 px-3 py-2 bg-green-500/10 text-green-600 hover:bg-green-500 hover:text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1"
        >
          <MessageSquare className="w-3 h-3" />
          WhatsApp
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onQuickAction?.('email')
          }}
          className="flex-1 px-3 py-2 bg-blue-500/10 text-blue-600 hover:bg-blue-500 hover:text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1"
        >
          <Mail className="w-3 h-3" />
          Email
        </button>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-border space-y-3 animate-fade-in-down">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Email</span>
            <a href={`mailto:${email}`} className="text-primary hover:underline">
              {email}
            </a>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Phone</span>
            <a href={`tel:${phone}`} className="text-primary hover:underline">
              {phone}
            </a>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Event Date</span>
            <span className="text-foreground font-medium">{eventDate}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Source</span>
            <span className="text-foreground font-medium">{source}</span>
          </div>
        </div>
      )}
    </div>
  )
}
