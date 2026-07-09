import { prisma } from '@/lib/db'

// Round-robins Task assignment across a project's 3 auto-provisioned mogul
// seats (see lib/seeds/property-defaults.ts), picking whoever currently has
// the fewest open (incomplete) tasks — self-balancing rather than a blind
// cycle, so one seat can't get buried while another sits idle.
export async function pickMogulAssignee(propertyId: string): Promise<string | null> {
  const moguls = await prisma.user.findMany({
    where: { staffTag: { not: null }, isActive: true, properties: { some: { propertyId } } },
    select: {
      id: true,
      _count: { select: { tasks: { where: { completed: false } } } },
    },
  })

  if (moguls.length === 0) return null

  moguls.sort((a, b) => a._count.tasks - b._count.tasks)
  return moguls[0].id
}
