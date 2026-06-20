"use client";

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

async function requestJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Falha de comunicacao.");
  return data;
}

export function joinRoom(roomCode: string, nickname: string, ubsName: string, avatarId: string, confirmReconnect = false) {
  return requestJson<StudentSessionState>("/api/student/join", {
    method: "POST",
    body: JSON.stringify({ roomCode, nickname, ubsName, avatarId, confirmReconnect })
  });
}

export function loadStudentState(roomId: string, studentId: string) {
  return requestJson<StudentSessionState>(
    `/api/student/state?roomId=${encodeURIComponent(roomId)}&studentId=${encodeURIComponent(studentId)}`
  );
}

export function answerQuestion(body: {
  roomId: string;
  studentId: string;
  questionId: string;
  selectedOptionId: string;
}) {
  return requestJson<StudentAnswer>("/api/student/answer", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export function startQuestionTimer(body: {
  roomId: string;
  studentId: string;
  questionId: string;
}) {
  return requestJson<QuestionTimer>("/api/student/question-start", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export function loadRoomState(roomCode: string) {
  return requestJson<RoomPublicState>(`/api/rooms/${encodeURIComponent(roomCode)}`);
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
