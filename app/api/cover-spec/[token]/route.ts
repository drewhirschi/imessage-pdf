import { NextRequest, NextResponse } from 'next/server';
import { getCoverSpec } from '@/lib/cover/spec';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const spec = getCoverSpec(token);
  if (!spec) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json(spec);
}
