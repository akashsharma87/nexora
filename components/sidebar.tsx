'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import {
  LayoutDashboard,
  Users,
  Megaphone,
  MessageCircle,
  BarChart3,
  Globe,
  Settings,
  LogOut,
  ChevronDown,
  FileText,
  Link2,
  Phone,
} from 'lucide-react'

import { ProjectSwitcher } from '@/components/project-switcher'

export function Sidebar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const userName = session?.user?.name ?? 'User'
  const userEmail = session?.user?.email ?? ''
  const userInitials = userName.split(' ').map((word: string) => word[0]).join('').toUpperCase().slice(0, 2)

  const mainMenuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/', id: 'dashboard' },
    { icon: Users, label: 'Leads', href: '/leads', id: 'leads' },
    { icon: Megaphone, label: 'Campaigns', href: '/campaigns', id: 'campaigns' },
    { icon: MessageCircle, label: 'WhatsApp', href: '/whatsapp', id: 'whatsapp' },
    { icon: BarChart3, label: 'Analytics', href: '/analytics', id: 'analytics' },
    { icon: Globe, label: 'Platforms', href: '/platforms', id: 'platforms' },
    { icon: FileText, label: 'Proposals', href: '/proposals', id: 'proposals' },
    { icon: Phone, label: 'AI Calls', href: '/ai-calls', id: 'ai-calls' },
  ]

  const bottomMenuItems = [
    { icon: Settings, label: 'Settings', href: '/settings', id: 'settings' },
    { icon: Link2, label: 'Integrations', href: '/settings/integrations', id: 'integrations' },
    { icon: LogOut, label: 'Logout', href: '/logout', id: 'logout' },
  ]

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <div className="w-64 h-screen bg-sidebar border-r border-sidebar-border flex flex-col fixed left-0 top-0 z-50">
      {/* Header */}
      <div className="p-6 border-b border-sidebar-border space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center">
            <span className="text-lg font-bold text-sidebar-primary-foreground">N</span>
          </div>
          <div className="flex-1">
            <h1 className="font-bold text-lg text-sidebar-foreground">NEXORA</h1>
            <p className="text-xs text-muted-foreground">Revenue OS</p>
          </div>
        </div>

        <ProjectSwitcher />
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <div className="space-y-1">
          {mainMenuItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-sm font-medium ${
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-md'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/30'
                }`}
              >
                <Icon size={20} className="flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Bottom Navigation */}
      <div className="border-t border-sidebar-border p-3 space-y-1">
        {bottomMenuItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)
          if (item.id === 'logout') {
            return (
              <button
                key={item.id}
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="flex w-full items-center gap-3 px-4 py-3 rounded-lg transition-all text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/30"
              >
                <Icon size={20} className="flex-shrink-0" />
                <span>{item.label}</span>
              </button>
            )
          }
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-sm font-medium ${
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-md'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/30'
              }`}
            >
              <Icon size={20} className="flex-shrink-0" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>

      {/* User Profile */}
      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-sidebar-accent/10 hover:bg-sidebar-accent/20 transition-colors cursor-pointer">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-xs font-bold text-sidebar-primary-foreground flex-shrink-0">
            {userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{userName}</p>
            <p className="text-xs text-sidebar-foreground/60 truncate">{userEmail}</p>
          </div>
          <ChevronDown size={16} className="flex-shrink-0 text-sidebar-foreground/60" />
        </div>
      </div>
    </div>
  )
}
