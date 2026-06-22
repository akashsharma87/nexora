'use client'

import { ExternalLink, MessageSquare, Phone, Mail } from 'lucide-react'

const leads = [
  {
    id: 1,
    name: 'Rajesh Sharma',
    email: 'rajesh@example.com',
    phone: '+91 98765 43210',
    eventDate: '2025-08-15',
    status: 'HOT',
    budget: '₹50L - ₹75L',
    source: 'WedMeGood',
  },
  {
    id: 2,
    name: 'Priya Verma',
    email: 'priya@example.com',
    phone: '+91 98765 43211',
    eventDate: '2025-09-20',
    status: 'WARM',
    budget: '₹30L - ₹50L',
    source: 'Google',
  },
  {
    id: 3,
    name: 'Arjun Patel',
    email: 'arjun@example.com',
    phone: '+91 98765 43212',
    eventDate: '2025-10-10',
    status: 'NEW',
    budget: '₹75L - ₹100L',
    source: 'Referral',
  },
  {
    id: 4,
    name: 'Neha Singh',
    email: 'neha@example.com',
    phone: '+91 98765 43213',
    eventDate: '2025-07-25',
    status: 'HOT',
    budget: '₹60L - ₹80L',
    source: 'Weddingz',
  },
]

const statusColors = {
  NEW: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  WARM: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  HOT: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
}

export function RecentLeadsTable() {
  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-semibold text-foreground">Recent Leads</h3>
        <a href="/leads" className="text-sm text-primary hover:underline">View All</a>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr className="text-muted-foreground text-left">
              <th className="pb-3 font-medium">Name</th>
              <th className="pb-3 font-medium">Contact</th>
              <th className="pb-3 font-medium">Event Date</th>
              <th className="pb-3 font-medium">Budget</th>
              <th className="pb-3 font-medium">Status</th>
              <th className="pb-3 font-medium">Source</th>
              <th className="pb-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                <td className="py-4 font-medium text-foreground">{lead.name}</td>
                <td className="py-4">
                  <div className="flex flex-col gap-1">
                    <a href={`mailto:${lead.email}`} className="text-primary hover:underline text-xs">
                      {lead.email}
                    </a>
                    <a href={`tel:${lead.phone}`} className="text-muted-foreground text-xs">
                      {lead.phone}
                    </a>
                  </div>
                </td>
                <td className="py-4 text-muted-foreground">
                  {new Date(lead.eventDate).toLocaleDateString('en-IN', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </td>
                <td className="py-4 text-muted-foreground">{lead.budget}</td>
                <td className="py-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColors[lead.status as keyof typeof statusColors]}`}>
                    {lead.status}
                  </span>
                </td>
                <td className="py-4 text-muted-foreground text-xs">{lead.source}</td>
                <td className="py-4">
                  <div className="flex justify-end gap-2">
                    <button className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground" title="Call">
                      <Phone size={16} />
                    </button>
                    <button className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground" title="Message">
                      <MessageSquare size={16} />
                    </button>
                    <button className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground" title="View Details">
                      <ExternalLink size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
