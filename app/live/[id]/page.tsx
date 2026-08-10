import { LiveActivityDetail } from '../../../components/live-activity-detail';

export default async function LiveActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LiveActivityDetail id={id} />;
}
