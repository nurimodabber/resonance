import { jsonResponse, verifySessionFromRequest } from './_lib/auth';
import { getCardsOrSeed, getStacksOrSeed, isBlobConfigured } from './_lib/store';

export async function GET(request: Request): Promise<Response> {
  if (!isBlobConfigured()) {
    return jsonResponse({ error: 'Vercel Blob storage is not configured.' }, 503);
  }

  try {
    const url = new URL(request.url);
    const wantsArchived = url.searchParams.get('includeArchived') === '1';
    const isAdmin = wantsArchived ? Boolean(verifySessionFromRequest(request)) : false;

    const [stacks, cards] = await Promise.all([getStacksOrSeed(), getCardsOrSeed()]);
    const visibleStacks = (isAdmin ? stacks : stacks.filter((s) => !s.archived))
      .slice()
      .sort((a, b) => a.ring - b.ring);
    const visibleCards = isAdmin ? cards : cards.filter((c) => !c.archived);

    return jsonResponse({
      mode: 'vercel',
      stacks: visibleStacks,
      cards: visibleCards,
    });
  } catch (err) {
    console.error('[api/catalog] GET failed:', err);
    return jsonResponse({ error: 'Failed to load catalog.' }, 500);
  }
}
