import { ActivityDetail } from '../../../components/activity-detail';
export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <ActivityDetail id={id}/>; }
