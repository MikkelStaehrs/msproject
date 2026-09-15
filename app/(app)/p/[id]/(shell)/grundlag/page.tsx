import { EconomicsScreen, type EconomicsParams } from '@/components/economics-screen'

export const dynamic = 'force-dynamic'

/**
 * Basis, as its own address. It is the Economics screen with the Basis section
 * open in the left column, exactly what /cost?basis=1 shows; the route stays
 * because the rail and older links point at it.
 */
export default async function BasisPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<EconomicsParams>
}) {
  const { id } = await params
  const search = await searchParams
  return <EconomicsScreen id={id} params={search} basisRoute />
}
