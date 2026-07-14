// Shared across compile.ts (produces 'scrape' facts), runner.ts (merges with stored 'manual'
// facts), and the API routes (accept/return the full union for the UI editor).
export type KeyFact = {
  category: string
  fact: string
  source: 'scrape' | 'manual'
}
