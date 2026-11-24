import { jsonResponse } from './_lib/auth';
import {
  getInboxSubmissions,
  INBOX_PATH,
  isBlobConfigured,
  readJsonBlob,
  roomBlobPath,
  type RoomRecord,
  writeJsonBlob,
} from './_lib/store';
import type { GroupRoom, GroupSubmission, Language, StackId } from '../src/types/deck';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(): string {
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

function normalizeRoomCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toUpperCase() : '';
}

export async function GET(request: Request): Promise<Response> {
  if (!isBlobConfigured()) {
    return jsonResponse({ error: 'Vercel Blob storage is not configured.' }, 503);
  }

  try {
    const url = new URL(request.url);
    const code = normalizeRoomCode(url.searchParams.get('code'));
    if (!/^[A-Z0-9]{4,8}$/.test(code)) {
      return jsonResponse({ error: 'Invalid room code.' }, 400);
    }

    const record = await readJsonBlob<RoomRecord>(roomBlobPath(code));
    if (!record) {
      return jsonResponse({ error: 'Room not found.' }, 404);
    }

    return jsonResponse({
      room: record.room,
      submissions: record.submissions ?? [],
    });
  } catch (err) {
    console.error('[api/rooms] GET failed:', err);
    return jsonResponse({ error: 'Failed to load room.' }, 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isBlobConfigured()) {
    return jsonResponse({ error: 'Vercel Blob storage is not configured.' }, 503);
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';

    if (action === 'create') {
      const rawStacks = Array.isArray(body.activeStackIds) ? body.activeStackIds : [];
      const activeStackIds = rawStacks.filter(
        (id): id is StackId => typeof id === 'string' && id.trim().length > 0,
      );
      const timerMinutes =
        typeof body.timerMinutes === 'number' && body.timerMinutes > 0 && body.timerMinutes <= 1440
          ? Math.round(body.timerMinutes)
          : undefined;

      let code = generateRoomCode();
      for (let attempt = 0; attempt < 4; attempt++) {
        const collision = await readJsonBlob<RoomRecord>(roomBlobPath(code));
        if (!collision) break;
        code = generateRoomCode();
      }

      const now = new Date();
      const expiresAt = timerMinutes
        ? new Date(now.getTime() + timerMinutes * 60_000).toISOString()
        : undefined;

      const room: GroupRoom = {
        code,
        createdAt: now.toISOString(),
        activeStackIds,
        timerMinutes,
        expiresAt,
      };

      await writeJsonBlob(roomBlobPath(code), {
        room,
        submissions: [],
      } satisfies RoomRecord);

      return jsonResponse({ room }, 201);
    }

    if (action === 'submit') {
      const roomCode = normalizeRoomCode(body.roomCode);
      if (!/^[A-Z0-9]{4,8}$/.test(roomCode)) {
        return jsonResponse({ error: 'Invalid room code.' }, 400);
      }

      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (text.length < 2 || text.length > 500) {
        return jsonResponse({ error: 'Question must be between 2 and 500 characters.' }, 400);
      }

      const language: Language = body.language === 'de' ? 'de' : 'en';
      const authorName =
        typeof body.authorName === 'string' && body.authorName.trim()
          ? body.authorName.trim().slice(0, 60)
          : undefined;
      const sourceCardId =
        typeof body.sourceCardId === 'string' && body.sourceCardId.trim()
          ? body.sourceCardId.trim().slice(0, 80)
          : undefined;

      const submission: GroupSubmission = {
        id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        roomCode,
        text,
        language,
        authorName,
        sourceCardId,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      const existingRoom = await readJsonBlob<RoomRecord>(roomBlobPath(roomCode));
      const roomRecord: RoomRecord = existingRoom
        ? {
            room: existingRoom.room,
            submissions: [submission, ...(existingRoom.submissions || [])].slice(0, 200),
          }
        : {
            room: {
              code: roomCode,
              createdAt: new Date().toISOString(),
              activeStackIds: [],
            },
            submissions: [submission],
          };

      const inbox = await getInboxSubmissions();
      await Promise.all([
        writeJsonBlob(roomBlobPath(roomCode), roomRecord),
        writeJsonBlob(INBOX_PATH, [submission, ...inbox].slice(0, 1000)),
      ]);

      return jsonResponse({ submission }, 201);
    }

    return jsonResponse({ error: 'Unsupported room action.' }, 400);
  } catch (err) {
    console.error('[api/rooms] POST failed:', err);
    return jsonResponse({ error: 'Failed to process room action.' }, 500);
  }
}
