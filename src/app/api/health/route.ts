import { config } from '@/lib/server/config';
import { CATALOG } from '@/lib/server/catalog';
import { prismConfigured } from '@/lib/server/providers/prism';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Liveness + non-secret configuration status. Never calls billable models. */
export async function GET(): Promise<Response> {
  const c = config();
  const providers = {
    nicrron: { configured: Boolean(c.nicrron.apiKey), model: c.nicrron.model, baseUrl: c.nicrron.baseUrl },
    typesafe: { configured: Boolean(c.typesafe.apiKey), model: c.typesafe.model },
    prism: { configured: prismConfigured() },
  };
  const ok = providers.nicrron.configured && providers.typesafe.configured && CATALOG.length > 0;
  return Response.json({
    status: ok ? 'ok' : 'degraded',
    providers,
    catalog: { products: new Set(CATALOG.map((p) => p.supplierPartNumber)).size, sizeOptions: CATALOG.length },
    commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null,
    time: new Date().toISOString(),
  }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
