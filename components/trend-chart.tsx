'use client'

import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Loader2 } from 'lucide-react'

type TrendPoint = { date: string; leads: number; proposals: number; bookings: number }

async function fetchTrend(): Promise<{ trend: TrendPoint[] }> {
  const response = await fetch('/api/analytics/trend')
  if (!response.ok) throw new Error('Failed to load trend')
  return response.json()
}

export function TrendChart() {
  const { data, isLoading } = useQuery({ queryKey: ['analytics-trend'], queryFn: fetchTrend })
  const trend = data?.trend ?? []

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <h3 className="font-semibold text-foreground mb-6">30-Day Performance Trend</h3>
      {isLoading ? (
        <div className="flex items-center justify-center h-[300px] text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading trend data...
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
              stroke="var(--color-muted-foreground)"
              style={{ fontSize: '11px' }}
              tick={{ fill: 'var(--color-muted-foreground)' }}
            />
            <YAxis
              stroke="var(--color-muted-foreground)"
              style={{ fontSize: '12px' }}
              tick={{ fill: 'var(--color-muted-foreground)' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-card)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
              }}
              cursor={{ stroke: 'var(--color-border)' }}
            />
            <Line
              type="monotone"
              dataKey="leads"
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={{ fill: 'var(--color-primary)', r: 4 }}
              activeDot={{ r: 6 }}
              name="Leads"
            />
            <Line
              type="monotone"
              dataKey="proposals"
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={{ fill: 'var(--color-accent)', r: 4 }}
              activeDot={{ r: 6 }}
              name="Proposals"
            />
            <Line
              type="monotone"
              dataKey="bookings"
              stroke="var(--color-secondary)"
              strokeWidth={2}
              dot={{ fill: 'var(--color-secondary)', r: 4 }}
              activeDot={{ r: 6 }}
              name="Bookings"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
