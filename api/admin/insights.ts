import { jsonResponse, requireAdmin } from '../_lib/auth.js';
import {
  CARDS_PATH,
  getCardsOrSeed,
  getInboxSubmissions,
  getRatings,
  getStacksOrSeed,
  INBOX_PATH,
  readJsonBlob,
  roomBlobPath,
  type RoomRecord,
  validateCardInput,
  writeJsonBlob,
} from '../_lib/store.js';

export async function GET(request: Request): Promise<Response> {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const [stacks, cards, ratings, submissions] = await Promise.all([
      getStacksOrSeed(),
      getCardsOrSeed(),
      getRatings(),
      getInboxSubmissions(),
    ]);

    return jsonResponse({
      stacks: stacks.slice().sort((a, b) => a.ring - b.ring),
      cards,
      ratings,
      submissions,
    });
  } catch (err) {
    console.error('[api/admin/insights] GET failed:', err);
    return jsonResponse({ error: 'Failed to load admin insights.' }, 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';

    if (action !== 'update-submission') {
      return jsonResponse({ error: 'Unsupported insights action.' }, 400);
    }

    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const status = body.status === 'promoted' ? 'promoted' : body.status === 'dismissed' ? 'dismissed' : null;
    const promotedStackId =
      typeof body.promotedStackId === 'string' ? body.promotedStackId.trim() : undefined;

    if (!id || !status) {
      return jsonResponse({ error: 'Submission ID and valid status are required.' }, 400);
    }

    const [inbox, stacks, cards] = await Promise.all([
      getInboxSubmissions(),
      getStacksOrSeed(),
      getCardsOrSeed(),
    ]);

    const targetSub = inbox.find((item) => item.id === id);
    if (!targetSub) {
      return jsonResponse({ error: 'Submission not found.' }, 404);
    }

    if (status === 'promoted' && body.card) {
      const validStackIds = new Set(stacks.map((s) => s.id));
      const parsedCard = validateCardInput(body.card, validStackIds);
      if (!parsedCard.ok) {
        return jsonResponse({ error: parsedCard.error }, 400);
      }
      await writeJsonBlob(CARDS_PATH, [parsedCard.card, ...cards]);
    }

    const updatedInbox = inbox.map((item) =>
      item.id === id ? { ...item, status, promotedStackId } : item,
    );

    const writes: Promise<void>[] = [writeJsonBlob(INBOX_PATH, updatedInbox)];

    const roomRecord = await readJsonBlob<RoomRecord>(roomBlobPath(targetSub.roomCode));
    if (roomRecord) {
      const updatedRoom: RoomRecord = {
        ...roomRecord,
        submissions: (roomRecord.submissions || []).map((item) =>
          item.id === id ? { ...item, status, promotedStackId } : item,
        ),
      };
      writes.push(writeJsonBlob(roomBlobPath(targetSub.roomCode), updatedRoom));
    }

    await Promise.all(writes);
    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('[api/admin/insights] POST failed:', err);
    return jsonResponse({ error: 'Failed to update submission.' }, 500);
  }
}
