"use client";

import { calculateAnswerScore, getQuestion } from "./quiz";
import type {
  CreateRoomResult,
  QuestionStats,
  QuestionTimer,
  RoomAdminAccessResult,
  RoomPublicState,
  StudentAnswer,
  StudentStats,
  StudentSessionState
} from "../types";

const OFFLINE_STATE_KEY = "questmed-online-offline-state";
const REQUEST_TIMEOUT_MS = 8000;

type PendingAnswer = {
  id: string;
  body: {
    roomId: string;
    studentId: string;
    questionId: string;
    selectedOptionId: string;
  };
  createdAt: string;
};

type PendingAvatar = {
  id: string;
  body: {
    roomId: string;
    studentId: string;
    avatarId: string;
  };
  createdAt: string;
};

type OfflineState = {
  roomStates: Record<string, RoomPublicState>;
  sessions: Record<string, StudentSessionState>;
  timers: Record<string, QuestionTimer>;
  pendingAnswers: PendingAnswer[];
  pendingAvatars: PendingAvatar[];
};

function createEmptyOfflineState(): OfflineState {
  return {
    roomStates: {},
    sessions: {},
    timers: {},
    pendingAnswers: [],
    pendingAvatars: []
  };
}

function getSessionKey(roomId: string, studentId: string) {
  return `${roomId}:${studentId}`;
}

function getTimerKey(roomId: string, studentId: string, questionId: string) {
  return `${roomId}:${studentId}:${questionId}`;
}

function readOfflineState(): OfflineState {
  if (typeof window === "undefined") return createEmptyOfflineState();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(OFFLINE_STATE_KEY) ?? "");
    return {
      ...createEmptyOfflineState(),
      ...(parsed && typeof parsed === "object" ? parsed : {})
    };
  } catch {
    return createEmptyOfflineState();
  }
}

function writeOfflineState(state: OfflineState) {
  window.localStorage.setItem(OFFLINE_STATE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("questmed-offline-state-changed"));
}

function cacheRoomState(state: RoomPublicState) {
  const offline = readOfflineState();
  offline.roomStates[state.room.roomCode] = state;
  writeOfflineState(offline);
}

function cacheStudentSession(session: StudentSessionState) {
  const offline = readOfflineState();
  offline.sessions[getSessionKey(session.room.id, session.student.id)] = session;
  writeOfflineState(offline);
}

function cacheQuestionTimer(timer: QuestionTimer) {
  const offline = readOfflineState();
  offline.timers[getTimerKey(timer.roomId, timer.studentId, timer.questionId)] = timer;
  writeOfflineState(offline);
}

function getCachedSession(roomId: string, studentId: string) {
  return readOfflineState().sessions[getSessionKey(roomId, studentId)] ?? null;
}

function getCachedRoomState(roomCode: string) {
  return readOfflineState().roomStates[roomCode] ?? null;
}

function getCachedTimer(roomId: string, studentId: string, questionId: string) {
  return readOfflineState().timers[getTimerKey(roomId, studentId, questionId)] ?? null;
}

function isNetworkLikeError(error: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (!(error instanceof Error)) return true;
  return /fetch|network|abort|timeout|failed|load|comunicacao|supabase|econn|epipe/i.test(error.message);
}

async function requestJson<T>(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: controller.signal
  });
  window.clearTimeout(timeout);
  try {
    const data = (await response.json()) as T & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Falha de comunicacao.");
    return data;
  } catch (error) {
    if (!response.ok) throw error;
    throw new Error("Falha ao interpretar resposta do servidor.");
  } finally {
    window.clearTimeout(timeout);
  }
}

async function trySyncPendingActions(roomId?: string, studentId?: string) {
  const offline = readOfflineState();
  const answersToSync = offline.pendingAnswers.filter(
    (item) => (!roomId || item.body.roomId === roomId) && (!studentId || item.body.studentId === studentId)
  );
  const avatarsToSync = offline.pendingAvatars.filter(
    (item) => (!roomId || item.body.roomId === roomId) && (!studentId || item.body.studentId === studentId)
  );

  const syncedAnswerIds = new Set<string>();
  for (const pending of answersToSync) {
    try {
      await requestJson<StudentAnswer>("/api/student/answer", {
        method: "POST",
        body: JSON.stringify(pending.body)
      });
      syncedAnswerIds.add(pending.id);
    } catch (error) {
      if (error instanceof Error && error.message.includes("ja respondeu")) {
        syncedAnswerIds.add(pending.id);
        continue;
      }
      if (isNetworkLikeError(error)) break;
    }
  }

  const syncedAvatarIds = new Set<string>();
  for (const pending of avatarsToSync) {
    try {
      await requestJson<StudentSessionState>("/api/student/avatar", {
        method: "PATCH",
        body: JSON.stringify(pending.body)
      });
      syncedAvatarIds.add(pending.id);
    } catch (error) {
      if (isNetworkLikeError(error)) break;
    }
  }

  if (syncedAnswerIds.size > 0 || syncedAvatarIds.size > 0) {
    const next = readOfflineState();
    next.pendingAnswers = next.pendingAnswers.filter((item) => !syncedAnswerIds.has(item.id));
    next.pendingAvatars = next.pendingAvatars.filter((item) => !syncedAvatarIds.has(item.id));
    writeOfflineState(next);
  }
}

export async function syncPendingOfflineActions(roomId?: string, studentId?: string) {
  await trySyncPendingActions(roomId, studentId);
}

export function getOfflineSyncSummary() {
  const offline = readOfflineState();
  return {
    pendingAnswers: offline.pendingAnswers.length,
    pendingAvatars: offline.pendingAvatars.length,
    pendingTotal: offline.pendingAnswers.length + offline.pendingAvatars.length
  };
}

function createOfflineAnswer(body: PendingAnswer["body"]): StudentAnswer {
  const question = getQuestion(body.questionId);
  const timer = getCachedTimer(body.roomId, body.studentId, body.questionId);
  const elapsedSeconds = body.selectedOptionId === "TIMEOUT"
    ? 90
    : Math.max(0, (Date.now() - new Date(timer?.startedAt ?? new Date().toISOString()).getTime()) / 1000);
  const selectedOption = body.selectedOptionId === "TIMEOUT"
    ? null
    : question.options.find((option) => option.id === body.selectedOptionId);
  const isCorrect = Boolean(selectedOption && selectedOption.id === question.correctOptionId);
  const score = body.selectedOptionId === "TIMEOUT" ? 0 : calculateAnswerScore(isCorrect, elapsedSeconds);
  return {
    id: `local-${body.studentId}-${body.questionId}`,
    roomId: body.roomId,
    studentId: body.studentId,
    questionId: body.questionId,
    selectedOptionId: body.selectedOptionId === "TIMEOUT" ? "TIMEOUT" : selectedOption?.id ?? "TIMEOUT",
    isCorrect,
    usedHint: false,
    score,
    answeredAt: new Date().toISOString()
  };
}

function applyLocalAnswerToCache(answer: StudentAnswer) {
  const offline = readOfflineState();
  const key = getSessionKey(answer.roomId, answer.studentId);
  const session = offline.sessions[key];
  if (!session || session.answers.some((item) => item.questionId === answer.questionId)) return;
  const answers = [...session.answers, answer];
  const totalScore = Number(answers.reduce((sum, item) => sum + item.score, 0).toFixed(1));
  offline.sessions[key] = {
    ...session,
    answers,
    student: {
      ...session.student,
      totalScore,
      answeredCount: answers.length,
      lastActivityAt: answer.answeredAt
    },
    pendingReleaseQuestionIds: session.pendingReleaseQuestionIds.filter((id) => id !== answer.questionId)
  };
  writeOfflineState(offline);
}

function queueAnswer(body: PendingAnswer["body"]) {
  const offline = readOfflineState();
  const alreadyQueued = offline.pendingAnswers.some(
    (item) => item.body.roomId === body.roomId && item.body.studentId === body.studentId && item.body.questionId === body.questionId
  );
  if (!alreadyQueued) {
    offline.pendingAnswers.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      body,
      createdAt: new Date().toISOString()
    });
  }
  writeOfflineState(offline);
}

function queueAvatar(body: PendingAvatar["body"]) {
  const offline = readOfflineState();
  offline.pendingAvatars = offline.pendingAvatars.filter((item) => item.body.roomId !== body.roomId || item.body.studentId !== body.studentId);
  offline.pendingAvatars.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    body,
    createdAt: new Date().toISOString()
  });
  const session = offline.sessions[getSessionKey(body.roomId, body.studentId)];
  if (session) {
    offline.sessions[getSessionKey(body.roomId, body.studentId)] = {
      ...session,
      student: { ...session.student, avatarId: body.avatarId }
    };
  }
  writeOfflineState(offline);
}

export async function joinRoom(roomCode: string, nickname: string, ubsName: string, avatarId: string, confirmReconnect = false) {
  try {
    const session = await requestJson<StudentSessionState>("/api/student/join", {
      method: "POST",
      body: JSON.stringify({ roomCode, nickname, ubsName, avatarId, confirmReconnect })
    });
    cacheStudentSession(session);
    return session;
  } catch (error) {
    const normalizedNickname = nickname.trim().toLocaleUpperCase("pt-BR");
    const cached = Object.values(readOfflineState().sessions).find(
      (session) => session.room.roomCode === roomCode && session.student.nickname === normalizedNickname
    );
    if (cached && isNetworkLikeError(error)) return cached;
    throw error;
  }
}

export async function loadStudentState(roomId: string, studentId: string) {
  try {
    await trySyncPendingActions(roomId, studentId);
    const session = await requestJson<StudentSessionState>(
      `/api/student/state?roomId=${encodeURIComponent(roomId)}&studentId=${encodeURIComponent(studentId)}`
    );
    cacheStudentSession(session);
    return session;
  } catch (error) {
    const cached = getCachedSession(roomId, studentId);
    if (cached && isNetworkLikeError(error)) return cached;
    throw error;
  }
}

export async function answerQuestion(body: {
  roomId: string;
  studentId: string;
  questionId: string;
  selectedOptionId: string;
}) {
  try {
    const answer = await requestJson<StudentAnswer>("/api/student/answer", {
      method: "POST",
      body: JSON.stringify(body)
    });
    applyLocalAnswerToCache(answer);
    return answer;
  } catch (error) {
    if (!isNetworkLikeError(error)) throw error;
    const answer = createOfflineAnswer(body);
    queueAnswer(body);
    applyLocalAnswerToCache(answer);
    return answer;
  }
}

export async function startQuestionTimer(body: {
  roomId: string;
  studentId: string;
  questionId: string;
}) {
  try {
    const timer = await requestJson<QuestionTimer>("/api/student/question-start", {
      method: "POST",
      body: JSON.stringify(body)
    });
    cacheQuestionTimer(timer);
    return timer;
  } catch (error) {
    if (!isNetworkLikeError(error)) throw error;
    const cached = getCachedTimer(body.roomId, body.studentId, body.questionId);
    if (cached) return cached;
    const timer = { ...body, startedAt: new Date().toISOString() };
    cacheQuestionTimer(timer);
    return timer;
  }
}

export async function startReleasedQuestions(body: {
  roomId: string;
  studentId: string;
}) {
  try {
    const session = await requestJson<StudentSessionState>("/api/student/start-released", {
      method: "POST",
      body: JSON.stringify(body)
    });
    cacheStudentSession(session);
    return session;
  } catch (error) {
    const cached = getCachedSession(body.roomId, body.studentId);
    if (cached && isNetworkLikeError(error)) {
      const nextSession = { ...cached, pendingReleaseQuestionIds: [], pendingReleaseExpiresAt: null };
      cacheStudentSession(nextSession);
      return nextSession;
    }
    throw error;
  }
}

export async function updateAvatar(body: {
  roomId: string;
  studentId: string;
  avatarId: string;
}) {
  try {
    const session = await requestJson<StudentSessionState>("/api/student/avatar", {
      method: "PATCH",
      body: JSON.stringify(body)
    });
    cacheStudentSession(session);
    return session;
  } catch (error) {
    const cached = getCachedSession(body.roomId, body.studentId);
    if (cached && isNetworkLikeError(error)) {
      queueAvatar(body);
      return { ...cached, student: { ...cached.student, avatarId: body.avatarId } };
    }
    throw error;
  }
}

export async function loadRoomState(roomCode: string) {
  try {
    const state = await requestJson<RoomPublicState>(`/api/rooms/${encodeURIComponent(roomCode)}`);
    cacheRoomState(state);
    return state;
  } catch (error) {
    const cached = getCachedRoomState(roomCode);
    if (cached && isNetworkLikeError(error)) return cached;
    throw error;
  }
}

export function createRoom(roomName: string, password: string) {
  return requestJson<CreateRoomResult>("/api/professor/rooms", {
    method: "POST",
    body: JSON.stringify({ roomName, password })
  });
}

export function listRooms(password: string) {
  return requestJson<{ rooms: unknown[] }>("/api/professor/rooms", {
    method: "PUT",
    body: JSON.stringify({ password })
  });
}

export function accessRoom(roomId: string, password: string) {
  return requestJson<RoomAdminAccessResult>("/api/professor/rooms", {
    method: "PATCH",
    body: JSON.stringify({ roomId, password })
  });
}

export function deleteRoom(roomId: string, password: string) {
  return requestJson<{ ok: true }>("/api/professor/rooms", {
    method: "DELETE",
    body: JSON.stringify({ roomId, password })
  });
}

export function updateReleasedQuestions(roomId: string, releasedQuestionIds: string[], adminKey: string) {
  return requestJson<RoomPublicState>(`/api/admin/rooms/${encodeURIComponent(roomId)}/released-questions`, {
    method: "POST",
    body: JSON.stringify({ adminKey, releasedQuestionIds })
  });
}

export function finishRoom(roomId: string, adminKey: string) {
  return requestJson<RoomPublicState>(`/api/admin/rooms/${encodeURIComponent(roomId)}/finish`, {
    method: "POST",
    body: JSON.stringify({ adminKey })
  });
}

export function deleteStudent(roomId: string, studentId: string, adminKey: string) {
  return requestJson<RoomPublicState>(
    `/api/admin/rooms/${encodeURIComponent(roomId)}/students/${encodeURIComponent(studentId)}`,
    {
      method: "DELETE",
      body: JSON.stringify({ adminKey })
    }
  );
}

export function updateStudentUbs(roomId: string, studentId: string, ubsId: string, adminKey: string) {
  return requestJson<RoomPublicState>(
    `/api/admin/rooms/${encodeURIComponent(roomId)}/students/${encodeURIComponent(studentId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ adminKey, ubsId })
    }
  );
}

export function deleteUbs(roomId: string, ubsId: string, adminKey: string) {
  return requestJson<RoomPublicState>(
    `/api/admin/rooms/${encodeURIComponent(roomId)}/ubs/${encodeURIComponent(ubsId)}`,
    {
      method: "DELETE",
      body: JSON.stringify({ adminKey })
    }
  );
}

export function loadQuestionStats(roomId: string, questionId: string, adminKey: string) {
  return requestJson<QuestionStats>(
    `/api/admin/rooms/${encodeURIComponent(roomId)}/question-stats?questionId=${encodeURIComponent(questionId)}&adminKey=${encodeURIComponent(adminKey)}`
  );
}

export function loadStudentStats(roomId: string, studentId: string, adminKey: string) {
  return requestJson<StudentStats>(
    `/api/admin/rooms/${encodeURIComponent(roomId)}/student-stats?studentId=${encodeURIComponent(studentId)}&adminKey=${encodeURIComponent(adminKey)}`
  );
}
