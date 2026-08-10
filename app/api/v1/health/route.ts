import { NextResponse } from 'next/server';
import { apiRoute } from '@/server/http/route';

export const GET = apiRoute(() => NextResponse.json({ status: 'ok' }));
