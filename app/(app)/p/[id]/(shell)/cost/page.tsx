import { EconomicsScreen, type EconomicsParams } from '@/components/economics-screen'

export const dynamic = 'force-dynamic'

/**
 * Economics. The screen itself lives in components/economics-screen so that
 * /grundlag can render the same columns with Basis open, from one data layer.
 */
export default async function CostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<EconomicsParams>
}) {
  const { id } = await params
  const search = await searchParams
  return <EconomicsScreen id={id} params={search} />
}
