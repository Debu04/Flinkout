import { getHeatmap } from '@/server/api/heatmap';
import { apiRoute } from '@/server/http/route';

export const GET = apiRoute(
  (request) => getHeatmap(request),
  { auth: true },
);
