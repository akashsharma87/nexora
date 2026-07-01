'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from 'next-auth/react'
import { ReactNode, useState } from 'react'
import { Toaster } from 'react-hot-toast'

import { ActiveProjectProvider } from '@/components/active-project-provider'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ActiveProjectProvider>
          {children}
          <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        </ActiveProjectProvider>
      </QueryClientProvider>
    </SessionProvider>
  )
}
