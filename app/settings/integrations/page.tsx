import { Suspense } from 'react'

import { IntegrationsPageContent } from './integrations-content'

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<div className="h-72" />}>
      <IntegrationsPageContent />
    </Suspense>
  )
}
