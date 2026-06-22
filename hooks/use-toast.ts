import { useState, useCallback } from 'react'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastMessage {
  id: string
  type: ToastType
  title: string
  description?: string
  duration?: number
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = useCallback(
    (message: Omit<ToastMessage, 'id'>) => {
      const id = Math.random().toString(36).substr(2, 9)
      const toast: ToastMessage = {
        ...message,
        id,
        duration: message.duration || 4000,
      }
      setToasts((prev) => [...prev, toast])
      return id
    },
    []
  )

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const success = useCallback(
    (title: string, description?: string) => {
      return addToast({ type: 'success', title, description })
    },
    [addToast]
  )

  const error = useCallback(
    (title: string, description?: string) => {
      return addToast({ type: 'error', title, description })
    },
    [addToast]
  )

  const info = useCallback(
    (title: string, description?: string) => {
      return addToast({ type: 'info', title, description })
    },
    [addToast]
  )

  return {
    toasts,
    addToast,
    removeToast,
    success,
    error,
    info,
  }
}
