import { jsonResponse, requireAdmin } from '../_lib/auth.js';
import {
  CARDS_PATH,
  getCardsOrSeed,
  getStacksOrSeed,
  STACKS_PATH,
  validateStackInput,
  writeJsonBlob,
} from '../_lib/store.js';
import type { StackMeta } from '../../src/types/deck';

function normalizeRings(stacks: StackMeta[]): StackMeta[] {
  return stacks.map((stack, index) => ({
    ...stack,
    ring: index + 1,
  }));
}

export async function POST(request: Request): Promise<Response> {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : 'upsert';
    const currentStacks = (await getStacksOrSeed())
      .slice()
      .sort((a, b) => a.ring - b.ring);

    if (action === 'reorder') {
      const orderedIds = Array.isArray(body.orderedIds)
        ? body.orderedIds.filter((id): id is string => typeof id === 'string')
        : [];
      const stackById = new Map(currentStacks.map((s) => [s.id, s]));
      const ordered: StackMeta[] = [];
      const seen = new Set<string>();

      for (const id of orderedIds) {
        const found = stackById.get(id);
        if (found && !seen.has(id)) {
          ordered.push(found);
          seen.add(id);
        }
      }
      for (const s of currentStacks) {
        if (!seen.has(s.id)) {
          ordered.push(s);
        }
      }

      const normalized = normalizeRings(ordered);
      await writeJsonBlob(STACKS_PATH, normalized);
      return jsonResponse({ stacks: normalized });
    }

    if (action === 'archive') {
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      const archived = Boolean(body.archived);
      const idx = currentStacks.findIndex((s) => s.id === id);
      if (idx === -1) {
        return jsonResponse({ error: 'Stack not found.' }, 404);
      }

      if (archived) {
        const remainingActive = currentStacks.filter((s) => s.id !== id && !s.archived);
        if (remainingActive.length === 0) {
          return jsonResponse(
            { error: 'At least one active stack must remain visible.' },
            400,
          );
        }
      }

      const nextStacks = currentStacks.slice();
      nextStacks[idx] = { ...nextStacks[idx], archived };
      await writeJsonBlob(STACKS_PATH, nextStacks);
      return jsonResponse({ stack: nextStacks[idx], stacks: nextStacks });
    }

    const rawStack = body.stack ?? body;
    const rawId =
      rawStack && typeof rawStack === 'object' && 'id' in rawStack
        ? String((rawStack as Record<string, unknown>).id || '')
        : '';
    const existingIdx = currentStacks.findIndex((s) => s.id === rawId.trim().toLowerCase());
    const fallbackRing =
      existingIdx >= 0 ? currentStacks[existingIdx].ring : currentStacks.length + 1;

    const parsed = validateStackInput(rawStack, fallbackRing);
    if (!parsed.ok) {
      return jsonResponse({ error: parsed.error }, 400);
    }

    const nextStacks = currentStacks.slice();
    if (existingIdx >= 0) {
      nextStacks[existingIdx] = {
        ...nextStacks[existingIdx],
        ...parsed.stack,
        ring: currentStacks[existingIdx].ring,
      };
    } else {
      nextStacks.push(parsed.stack);
    }

    const normalized = normalizeRings(nextStacks);
    const saved = normalized.find((s) => s.id === parsed.stack.id) ?? parsed.stack;
    await writeJsonBlob(STACKS_PATH, normalized);
    return jsonResponse({ stack: saved, stacks: normalized });
  } catch (err) {
    console.error('[api/admin/stacks] POST failed:', err);
    return jsonResponse({ error: 'Failed to save stack.' }, 500);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id')?.trim().toLowerCase() || '';
    const reassignTo = url.searchParams.get('reassignTo')?.trim().toLowerCase() || '';

    if (!id) {
      return jsonResponse({ error: 'Stack ID is required.' }, 400);
    }

    const [currentStacks, cards] = await Promise.all([getStacksOrSeed(), getCardsOrSeed()]);
    const targetExists = currentStacks.some((s) => s.id === id);
    if (!targetExists) {
      return jsonResponse({ error: 'Stack not found.' }, 404);
    }

    const remainingStacks = currentStacks.filter((s) => s.id !== id);
    if (remainingStacks.length === 0) {
      return jsonResponse({ error: 'At least one stack must remain.' }, 400);
    }

    const affectedCards = cards.filter((c) => c.stackId === id);
    if (affectedCards.length > 0) {
      const validDestination =
        reassignTo && reassignTo !== id && remainingStacks.some((s) => s.id === reassignTo);
      if (!validDestination) {
        return jsonResponse(
          {
            error: 'Stack still contains cards. Choose another stack to move them into.',
            cardCount: affectedCards.length,
          },
          409,
        );
      }

      const reassignedCards = cards.map((c) =>
        c.stackId === id ? { ...c, stackId: reassignTo } : c,
      );
      await writeJsonBlob(CARDS_PATH, reassignedCards);
    }

    const normalizedStacks = normalizeRings(remainingStacks.sort((a, b) => a.ring - b.ring));
    await writeJsonBlob(STACKS_PATH, normalizedStacks);

    return jsonResponse({
      ok: true,
      deletedId: id,
      reassignedCount: affectedCards.length,
      stacks: normalizedStacks,
    });
  } catch (err) {
    console.error('[api/admin/stacks] DELETE failed:', err);
    return jsonResponse({ error: 'Failed to delete stack.' }, 500);
  }
}
