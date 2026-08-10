import { DiscoveryExperience } from '../../components/discovery-experience';
export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <DiscoveryExperience initialQuery={q ?? ''}/>;
}
