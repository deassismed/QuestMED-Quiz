import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import type {
  CreateRoomResult,
  OnlineRoom,
  ProfessorRoomSummary,
  QuestionStats,
  QuestionTimer,
  RoomAdminAccessResult,
  RoomPublicState,
  Student,
  StudentAnswer,
  StudentStats,
  StudentSessionState,
  UbsTeam
} from "../types";
import { QUESTION_TIME_LIMIT_SECONDS, calculateAnswerScore, getQuestion, questions } from "./quiz";
import { normalizeAvatarId } from "./avatars";
import { getServerSupabase } from "./supabase-server";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type RoomRow = {
  id: string;
  room_code: string;
  room_name: string | null;
  released_question_ids: string[];
  status: OnlineRoom["status"];
  created_at: string;
  updated_at: string;
  finished_at: string | null;
};

type UbsRow = {
  id: string;
  room_id: string;
  name: string;
  created_at: string;
};

type StudentRow = {
  id: string;
  room_id: string;
  ubs_id: string;
  nickname: string;
  avatar_id: string | null;
  total_score: number | string;
  answered_count: number;
  joined_at: string;
  last_activity_at: string;
};

type AnswerRow = {
  id: string;
  room_id: string;
  student_id: string;
  question_id: string;
  selected_option_id: StudentAnswer["selectedOptionId"];
  is_correct: boolean;
  used_hint: boolean;
  score: number | string;
  answered_at: string;
};

type QuestionTimerRow = {
  room_id: string;
  student_id: string;
  question_id: string;
  started_at: string;
};

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR").replace(/[^\p{L}\p{N} .'-]/gu, "");
}

function hashAdminKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function createRoomCode() {
  return Array.from({ length: 6 }, () => ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]).join("");
}

function toRoom(row: RoomRow): OnlineRoom {
  return {
    id: row.id,
    roomCode: row.room_code,
    roomName: row.room_name,
    releasedQuestionIds: row.released_question_ids ?? [],
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at
  };
}

function toStudent(row: StudentRow): Student {
  return {
    id: row.id,
    roomId: row.room_id,
    ubsId: row.ubs_id,
    nickname: row.nickname,
    avatarId: normalizeAvatarId(row.avatar_id),
    totalScore: Number(row.total_score ?? 0),
    answeredCount: row.answered_count,
    joinedAt: row.joined_at,
    lastActivityAt: row.last_activity_at
  };
}

function toAnswer(row: AnswerRow): StudentAnswer {
  return {
    id: row.id,
    roomId: row.room_id,
    studentId: row.student_id,
    questionId: row.question_id,
    selectedOptionId: row.selected_option_id,
    isCorrect: row.is_correct,
    usedHint: row.used_hint,
    score: Number(row.score ?? 0),
    answeredAt: row.answered_at
  };
}

function toQuestionTimer(row: QuestionTimerRow): QuestionTimer {
  return {
    roomId: row.room_id,
    studentId: row.student_id,
    questionId: row.question_id,
    startedAt: row.started_at
  };
}

function toUbs(row: UbsRow, students: Student[]): UbsTeam {
  const members = students.filter((student) => student.ubsId === row.id);
  const total = members.reduce((sum, student) => sum + student.totalScore, 0);
  return {
    id: row.id,
    roomId: row.room_id,
    name: row.name,
    memberCount: members.length,
    averageScore: members.length ? Number((total / members.length).toFixed(1)) : 0,
    answeredCount: members.reduce((sum, student) => sum + student.answeredCount, 0),
    createdAt: row.created_at
  };
}

async function requireRoomById(roomId: string) {
  const { data, error } = await getServerSupabase().from("qmq_rooms").select("*").eq("id", roomId).maybeSingle<RoomRow>();
  if (error) throw error;
  if (!data) throw new Error("Sala nao encontrada.");
  return toRoom(data);
}

async function requireRoomByCode(roomCode: string) {
  const code = roomCode.trim().toUpperCase();
  const { data, error } = await getServerSupabase().from("qmq_rooms").select("*").eq("room_code", code).maybeSingle<RoomRow>();
  if (error) throw error;
  if (!data) throw new Error("Sala nao encontrada.");
  return toRoom(data);
}

export async function validateAdmin(roomId: string, adminKey: string) {
  const { data, error } = await getServerSupabase()
    .from("qmq_room_admin")
    .select("admin_key_hash")
    .eq("room_id", roomId)
    .maybeSingle<{ admin_key_hash: string }>();
  if (error) throw error;
  return Boolean(data && data.admin_key_hash === hashAdminKey(adminKey));
}

export function validateProfessorPassword(password: string) {
  const expected = process.env.PROFESSOR_PASSWORD;
  if (!expected) throw new Error("Configure PROFESSOR_PASSWORD.");
  return password === expected;
}

export async function createOnlineRoom(roomName?: string): Promise<CreateRoomResult> {
  const supabase = getServerSupabase();
  let roomCode = createRoomCode();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data } = await supabase.from("qmq_rooms").select("id").eq("room_code", roomCode).maybeSingle();
    if (!data) break;
    roomCode = createRoomCode();
  }
  const now = new Date().toISOString();
  const roomId = randomUUID();
  const adminKey = randomBytes(24).toString("base64url");
  const { data, error } = await supabase
    .from("qmq_rooms")
    .insert({
      id: roomId,
      room_code: roomCode,
      room_name: roomName?.trim() || null,
      released_question_ids: [],
      status: "active",
      created_at: now,
      updated_at: now
    })
    .select("*")
    .single<RoomRow>();
  if (error) throw error;
  const { error: adminError } = await supabase
    .from("qmq_room_admin")
    .insert({ room_id: roomId, admin_key_hash: hashAdminKey(adminKey) });
  if (adminError) throw adminError;
  return { room: toRoom(data), adminKey };
}

export async function createRoomAdminAccess(roomId: string): Promise<RoomAdminAccessResult> {
  const room = await requireRoomById(roomId);
  const adminKey = randomBytes(24).toString("base64url");
  const { error } = await getServerSupabase()
    .from("qmq_room_admin")
    .update({ admin_key_hash: hashAdminKey(adminKey) })
    .eq("room_id", room.id);
  if (error) throw error;
  return { room, adminKey };
}

export async function listProfessorRooms(): Promise<ProfessorRoomSummary[]> {
  const supabase = getServerSupabase();
  const { data: roomsData, error: roomsError } = await supabase.from("qmq_rooms").select("*").order("created_at", { ascending: false });
  if (roomsError) throw roomsError;
  const { data: studentsData, error: studentsError } = await supabase.from("qmq_students").select("*");
  if (studentsError) throw studentsError;
  const { data: ubsData, error: ubsError } = await supabase.from("qmq_ubs_teams").select("*");
  if (ubsError) throw ubsError;
  const students = ((studentsData ?? []) as StudentRow[]).map(toStudent);
  return ((roomsData ?? []) as RoomRow[]).map((row) => {
    const room = toRoom(row);
    const roomStudents = students.filter((student) => student.roomId === room.id);
    const roomUbsCount = ((ubsData ?? []) as UbsRow[]).filter((ubs) => ubs.room_id === room.id).length;
    return {
      room,
      studentCount: roomStudents.length,
      ubsCount: roomUbsCount,
      averageTeamScore: roomStudents.length
        ? Number((roomStudents.reduce((sum, student) => sum + student.totalScore, 0) / roomStudents.length).toFixed(1))
        : 0,
      lastActivityAt: roomStudents.map((student) => student.lastActivityAt).sort((a, b) => b.localeCompare(a))[0] ?? null
    };
  });
}

export async function getRoomPublicState(roomCode: string): Promise<RoomPublicState> {
  const room = await requireRoomByCode(roomCode);
  return getRoomPublicStateById(room.id);
}

export async function getRoomPublicStateById(roomId: string): Promise<RoomPublicState> {
  const room = await requireRoomById(roomId);
  const supabase = getServerSupabase();
  const { data: studentsData, error: studentsError } = await supabase.from("qmq_students").select("*").eq("room_id", room.id).order("joined_at");
  if (studentsError) throw studentsError;
  const students = ((studentsData ?? []) as StudentRow[]).map(toStudent);
  const { data: ubsData, error: ubsError } = await supabase.from("qmq_ubs_teams").select("*").eq("room_id", room.id).order("created_at");
  if (ubsError) throw ubsError;
  return { room, students, ubsTeams: ((ubsData ?? []) as UbsRow[]).map((ubs) => toUbs(ubs, students)) };
}

export async function joinOnlineRoom(
  roomCode: string,
  nickname: string,
  ubsName: string,
  avatarId?: string,
  confirmReconnect = false
): Promise<StudentSessionState> {
  const room = await requireRoomByCode(roomCode);
  if (room.status === "finished") throw new Error("Esta sala ja foi encerrada.");
  const normalizedNickname = normalizeName(nickname);
  const normalizedUbs = normalizeName(ubsName);
  const normalizedAvatarId = normalizeAvatarId(avatarId);
  if (!normalizedNickname) throw new Error("Informe seu nickname.");
  if (!normalizedUbs) throw new Error("Informe ou escolha uma UBS.");
  const supabase = getServerSupabase();

  let ubsRow: UbsRow | null = null;
  const { data: existingUbs, error: ubsFindError } = await supabase
    .from("qmq_ubs_teams")
    .select("*")
    .eq("room_id", room.id)
    .eq("name_normalized", normalizedUbs)
    .maybeSingle<UbsRow>();
  if (ubsFindError) throw ubsFindError;
  ubsRow = existingUbs ?? null;
  if (!ubsRow) {
    const { data, error } = await supabase
      .from("qmq_ubs_teams")
      .insert({ id: randomUUID(), room_id: room.id, name: normalizedUbs, name_normalized: normalizedUbs })
      .select("*")
      .single<UbsRow>();
    if (error) throw error;
    ubsRow = data;
  }

  const { data: existingStudent, error: studentFindError } = await supabase
    .from("qmq_students")
    .select("*")
    .eq("room_id", room.id)
    .eq("nickname_normalized", normalizedNickname)
    .maybeSingle<StudentRow>();
  if (studentFindError) throw studentFindError;
  if (existingStudent && !confirmReconnect) throw new Error("NICKNAME_EXISTS:Este nickname ja esta em uso nesta sala.");

  let student: Student;
  if (existingStudent) {
    const { data, error } = await supabase
      .from("qmq_students")
      .update({ ubs_id: ubsRow.id, avatar_id: normalizedAvatarId, last_activity_at: new Date().toISOString() })
      .eq("id", existingStudent.id)
      .select("*")
      .single<StudentRow>();
    if (error) throw error;
    student = toStudent(data);
  } else {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("qmq_students")
      .insert({
        id: randomUUID(),
        room_id: room.id,
        ubs_id: ubsRow.id,
        nickname: normalizedNickname,
        nickname_normalized: normalizedNickname,
        avatar_id: normalizedAvatarId,
        joined_at: now,
        last_activity_at: now
      })
      .select("*")
      .single<StudentRow>();
    if (error) throw error;
    student = toStudent(data);
  }

  const answers = await listAnswers(student.id);
  const publicState = await getRoomPublicStateById(room.id);
  const ubsTeam = publicState.ubsTeams.find((item) => item.id === ubsRow.id) ?? toUbs(ubsRow, [student]);
  return { room: publicState.room, student, ubsTeam, answers };
}

async function listAnswers(studentId: string) {
  const { data, error } = await getServerSupabase()
    .from("qmq_answers")
    .select("*")
    .eq("student_id", studentId)
    .order("answered_at");
  if (error) throw error;
  return ((data ?? []) as AnswerRow[]).map(toAnswer);
}

async function updateStudentTotals(studentId: string) {
  const answers = await listAnswers(studentId);
  const totalScore = Number(answers.reduce((sum, answer) => sum + answer.score, 0).toFixed(1));
  const { data, error } = await getServerSupabase()
    .from("qmq_students")
    .update({ total_score: totalScore, answered_count: answers.length, last_activity_at: new Date().toISOString() })
    .eq("id", studentId)
    .select("*")
    .single<StudentRow>();
  if (error) throw error;
  return toStudent(data);
}

export async function ensureQuestionTimer(input: {
  roomId: string;
  studentId: string;
  questionId: string;
}): Promise<QuestionTimer> {
  const room = await requireRoomById(input.roomId);
  if (room.status === "finished") throw new Error("Esta sala ja foi encerrada.");
  if (!room.releasedQuestionIds.includes(input.questionId)) throw new Error("Esta questao ainda nao foi liberada.");
  getQuestion(input.questionId);
  const supabase = getServerSupabase();
  const { data: existing, error: findError } = await supabase
    .from("qmq_question_timers")
    .select("*")
    .eq("room_id", input.roomId)
    .eq("student_id", input.studentId)
    .eq("question_id", input.questionId)
    .maybeSingle<QuestionTimerRow>();
  if (findError) throw findError;
  if (existing) return toQuestionTimer(existing);
  const { data, error } = await supabase
    .from("qmq_question_timers")
    .insert({
      room_id: input.roomId,
      student_id: input.studentId,
      question_id: input.questionId,
      started_at: new Date().toISOString()
    })
    .select("*")
    .single<QuestionTimerRow>();
  if (error) {
    if (error.code === "23505") return ensureQuestionTimer(input);
    throw error;
  }
  return toQuestionTimer(data);
}

export async function getStudentState(roomId: string, studentId: string): Promise<StudentSessionState> {
  const room = await requireRoomById(roomId);
  const { data, error } = await getServerSupabase().from("qmq_students").select("*").eq("id", studentId).eq("room_id", roomId).single<StudentRow>();
  if (error) throw error;
  const student = toStudent(data);
  const publicState = await getRoomPublicStateById(roomId);
  const ubsTeam = publicState.ubsTeams.find((item) => item.id === student.ubsId);
  if (!ubsTeam) throw new Error("UBS nao encontrada.");
  return { room, student, ubsTeam, answers: await listAnswers(studentId) };
}

export async function submitAnswer(input: {
  roomId: string;
  studentId: string;
  questionId: string;
  selectedOptionId: string;
}) {
  const room = await requireRoomById(input.roomId);
  if (room.status === "finished") throw new Error("Esta sala ja foi encerrada.");
  if (!room.releasedQuestionIds.includes(input.questionId)) throw new Error("Esta questao ainda nao foi liberada.");
  const question = getQuestion(input.questionId);
  const timer = await ensureQuestionTimer(input);
  const elapsedSeconds = Math.max(0, (Date.now() - new Date(timer.startedAt).getTime()) / 1000);
  const timedOut = elapsedSeconds > QUESTION_TIME_LIMIT_SECONDS || input.selectedOptionId === "TIMEOUT";
  const selectedOption = timedOut ? null : question.options.find((option) => option.id === input.selectedOptionId);
  if (!timedOut && !selectedOption) throw new Error("Alternativa invalida.");
  const isCorrect = Boolean(selectedOption && selectedOption.id === question.correctOptionId);
  const score = timedOut ? 0 : calculateAnswerScore(isCorrect, elapsedSeconds);
  const now = new Date().toISOString();
  const { data, error } = await getServerSupabase()
    .from("qmq_answers")
    .insert({
      id: randomUUID(),
      room_id: room.id,
      student_id: input.studentId,
      question_id: question.id,
      selected_option_id: timedOut ? "TIMEOUT" : selectedOption?.id,
      is_correct: isCorrect,
      used_hint: false,
      score,
      answered_at: now
    })
    .select("*")
    .single<AnswerRow>();
  if (error) {
    if (error.code === "23505") throw new Error("Voce ja respondeu esta questao.");
    throw error;
  }
  await updateStudentTotals(input.studentId);
  return toAnswer(data);
}

export async function setReleasedQuestions(roomId: string, adminKey: string, questionIds: string[]) {
  if (!(await validateAdmin(roomId, adminKey))) throw new Error("Chave administrativa invalida.");
  const validIds = new Set(questions.map((question) => question.id));
  const releasedQuestionIds = Array.from(new Set(questionIds.map((item) => item.toUpperCase()))).filter((id) => validIds.has(id));
  const { error } = await getServerSupabase()
    .from("qmq_rooms")
    .update({ released_question_ids: releasedQuestionIds, updated_at: new Date().toISOString() })
    .eq("id", roomId);
  if (error) throw error;
  return getRoomPublicStateById(roomId);
}

export async function finishOnlineRoom(roomId: string, adminKey: string) {
  if (!(await validateAdmin(roomId, adminKey))) throw new Error("Chave administrativa invalida.");
  const { error } = await getServerSupabase()
    .from("qmq_rooms")
    .update({ status: "finished", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", roomId);
  if (error) throw error;
  return getRoomPublicStateById(roomId);
}

export async function deleteRoomStudent(roomId: string, adminKey: string, studentId: string) {
  if (!(await validateAdmin(roomId, adminKey))) throw new Error("Chave administrativa invalida.");
  const { error } = await getServerSupabase()
    .from("qmq_students")
    .delete()
    .eq("room_id", roomId)
    .eq("id", studentId);
  if (error) throw error;
  return getRoomPublicStateById(roomId);
}

export async function deleteRoomUbs(roomId: string, adminKey: string, ubsId: string) {
  if (!(await validateAdmin(roomId, adminKey))) throw new Error("Chave administrativa invalida.");
  const supabase = getServerSupabase();
  const { error: studentsError } = await supabase
    .from("qmq_students")
    .delete()
    .eq("room_id", roomId)
    .eq("ubs_id", ubsId);
  if (studentsError) throw studentsError;
  const { error: ubsError } = await supabase
    .from("qmq_ubs_teams")
    .delete()
    .eq("room_id", roomId)
    .eq("id", ubsId);
  if (ubsError) throw ubsError;
  return getRoomPublicStateById(roomId);
}

export async function getQuestionStats(roomId: string, adminKey: string, questionId: string): Promise<QuestionStats> {
  if (!(await validateAdmin(roomId, adminKey))) throw new Error("Chave administrativa invalida.");
  const question = getQuestion(questionId);
  const { data, error } = await getServerSupabase()
    .from("qmq_answers")
    .select("selected_option_id,is_correct")
    .eq("room_id", roomId)
    .eq("question_id", question.id);
  if (error) throw error;
  const rows = (data ?? []) as Pick<AnswerRow, "selected_option_id" | "is_correct">[];
  const totalAnswers = rows.length;
  const optionIds = [...question.options.map((option) => option.id), "TIMEOUT"] as const;
  const options = optionIds.map((optionId) => {
    const count = rows.filter((answer) => answer.selected_option_id === optionId).length;
    return {
      optionId,
      count,
      percent: totalAnswers ? Number(((count / totalAnswers) * 100).toFixed(1)) : 0,
      isCorrect: optionId === question.correctOptionId
    };
  });
  return {
    questionId: question.id,
    totalAnswers,
    correctCount: rows.filter((answer) => answer.is_correct).length,
    incorrectCount: rows.filter((answer) => !answer.is_correct && answer.selected_option_id !== "TIMEOUT").length,
    timeoutCount: rows.filter((answer) => answer.selected_option_id === "TIMEOUT").length,
    options
  };
}

export async function getStudentStats(roomId: string, adminKey: string, studentId: string): Promise<StudentStats> {
  if (!(await validateAdmin(roomId, adminKey))) throw new Error("Chave administrativa invalida.");
  const room = await requireRoomById(roomId);
  const supabase = getServerSupabase();
  const { data: studentRow, error: studentError } = await supabase
    .from("qmq_students")
    .select("*")
    .eq("room_id", room.id)
    .eq("id", studentId)
    .single<StudentRow>();
  if (studentError) throw studentError;
  const student = toStudent(studentRow);
  const { data: ubsRow, error: ubsError } = await supabase
    .from("qmq_ubs_teams")
    .select("*")
    .eq("id", student.ubsId)
    .single<UbsRow>();
  if (ubsError) throw ubsError;
  const answers = await listAnswers(student.id);
  const answerStats = answers.map((answer) => {
    const question = getQuestion(answer.questionId);
    return {
      questionId: answer.questionId,
      theme: question.theme,
      selectedOptionId: answer.selectedOptionId,
      correctOptionId: question.correctOptionId,
      isCorrect: answer.isCorrect,
      score: answer.score,
      answeredAt: answer.answeredAt
    };
  });
  const correctCount = answers.filter((answer) => answer.isCorrect).length;
  const timeoutCount = answers.filter((answer) => answer.selectedOptionId === "TIMEOUT").length;
  const totalScore = Number(answers.reduce((sum, answer) => sum + answer.score, 0).toFixed(1));
  return {
    student,
    ubsName: ubsRow.name,
    totalQuestions: room.releasedQuestionIds.length,
    answeredCount: answers.length,
    correctCount,
    incorrectCount: answers.length - correctCount - timeoutCount,
    timeoutCount,
    totalScore,
    averageScore: answers.length ? Number((totalScore / answers.length).toFixed(1)) : 0,
    answers: answerStats
  };
}
