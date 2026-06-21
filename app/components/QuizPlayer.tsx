"use client";

import { Check, Clock3, LockKeyhole, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AvatarBadge } from "./AvatarBadge";
import { AVATAR_PRESETS, DEFAULT_AVATAR_ID } from "../lib/avatars";
import { answerQuestion, joinRoom, loadRoomState, loadStudentState, startQuestionTimer, startReleasedQuestions } from "../lib/online-client";
import { getBrowserSupabase } from "../lib/supabase-browser";
import type { QuestionOption, QuizQuestion, RoomPublicState, StudentSessionState } from "../types";

type Step = "room" | "student" | "quiz";

const SESSION_KEY = "questmed-quiz-session";
const LAST_NICKNAME_KEY = "questmed-quiz-last-nickname";
const QUESTION_TIME_LIMIT_SECONDS = 90;
const DISPLAY_OPTION_IDS = ["A", "B", "C", "D"] as const;

function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function normalizeName(value: string) {
  return value.toLocaleUpperCase("pt-BR").replace(/[^\p{L}\p{N} .'-]/gu, "");
}

export function QuizPlayer({ questions }: { questions: QuizQuestion[] }) {
  const [step, setStep] = useState<Step>("room");
  const [roomCode, setRoomCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [ubsName, setUbsName] = useState("");
  const [addingNewUbs, setAddingNewUbs] = useState(false);
  const [avatarId, setAvatarId] = useState<string>(DEFAULT_AVATAR_ID);
  const [state, setState] = useState<RoomPublicState | null>(null);
  const [session, setSession] = useState<StudentSessionState | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [questionStartedAt, setQuestionStartedAt] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(QUESTION_TIME_LIMIT_SECONDS);
  const [releaseNoticeSeconds, setReleaseNoticeSeconds] = useState(0);
  const [answerFlash, setAnswerFlash] = useState<{ isCorrect: boolean; score: number; timeout?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [duplicateNickname, setDuplicateNickname] = useState(false);
  const roomInputRef = useRef<HTMLInputElement>(null);
  const nicknameInputRef = useRef<HTMLInputElement>(null);
  const ubsInputRef = useRef<HTMLInputElement>(null);
  const enterButtonRef = useRef<HTMLButtonElement>(null);
  const reconnectNoticeRef = useRef<HTMLDivElement>(null);
  const timeoutQuestionRef = useRef("");

  const answersByQuestion = useMemo(
    () => new Map((session?.answers ?? []).map((answer) => [answer.questionId, answer])),
    [session?.answers]
  );
  const releasedQuestions = questions.filter((question) => session?.room.releasedQuestionIds.includes(question.id));
  const pendingReleaseQuestionIds = session?.pendingReleaseQuestionIds ?? [];
  const pendingReleaseQuestionIdSet = new Set(pendingReleaseQuestionIds);
  const availableReleasedQuestions = releasedQuestions.filter((question) => !pendingReleaseQuestionIdSet.has(question.id));
  const pendingReleaseQuestions = releasedQuestions.filter((question) => pendingReleaseQuestionIdSet.has(question.id));
  const unansweredQuestion = releasedQuestions.find((question) => !answersByQuestion.has(question.id)) ?? null;
  const availableUnansweredQuestion = availableReleasedQuestions.find((question) => !answersByQuestion.has(question.id)) ?? null;
  const allReleasedAnswered = releasedQuestions.length > 0 && !unansweredQuestion && pendingReleaseQuestions.length === 0;
  const answeredQuestionStats = releasedQuestions
    .map((question) => ({ question, answer: answersByQuestion.get(question.id) }))
    .filter((item): item is { question: QuizQuestion; answer: NonNullable<ReturnType<typeof answersByQuestion.get>> } => Boolean(item.answer));
  const selectedQuestion = releasedQuestions.find((question) => question.id === selectedQuestionId);
  const currentQuestion =
    selectedQuestion && !answersByQuestion.has(selectedQuestion.id) && !pendingReleaseQuestionIdSet.has(selectedQuestion.id)
      ? selectedQuestion
      : availableUnansweredQuestion;
  const currentAnswer = currentQuestion ? answersByQuestion.get(currentQuestion.id) : null;
  const shuffledCurrentOptions = useMemo(
    () => currentQuestion && session ? getStudentQuestionOptions(currentQuestion, session.student.id) : [],
    [currentQuestion, session?.student.id]
  );
  const ubsOptions = state?.ubsTeams ?? [];
  const canChooseUbs = nickname.trim().length > 0;
  const canChooseAvatar = canChooseUbs && ubsName.trim().length > 0;
  const individualRanking = [...(state?.students ?? [])].sort((a, b) => b.totalScore - a.totalScore || a.joinedAt.localeCompare(b.joinedAt));
  const teamRanking = [...(state?.ubsTeams ?? [])].sort((a, b) => b.averageScore - a.averageScore || b.memberCount - a.memberCount);
  const currentStudentRank = Math.max(1, individualRanking.findIndex((student) => student.id === session?.student.id) + 1 || 1);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedRoom = normalizeCode(params.get("sala") ?? "");
    const saved = window.localStorage.getItem(SESSION_KEY);
    if (requestedRoom) {
      setRoomCode(requestedRoom);
      setNickname(normalizeName(window.localStorage.getItem(LAST_NICKNAME_KEY) ?? ""));
      void loadRoom(requestedRoom, true);
      return;
    }
    setNickname(normalizeName(window.localStorage.getItem(LAST_NICKNAME_KEY) ?? ""));
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { roomId: string; studentId: string };
        void loadStudentState(parsed.roomId, parsed.studentId).then((next) => {
          setSession(next);
          setRoomCode(next.room.roomCode);
          setNickname(next.student.nickname);
          setUbsName(next.ubsTeam.name);
          setAddingNewUbs(false);
          setAvatarId(next.student.avatarId ?? DEFAULT_AVATAR_ID);
          setStep("quiz");
        });
      } catch {
        window.localStorage.removeItem(SESSION_KEY);
      }
    }
  }, []);

  useEffect(() => {
    if (step !== "student" || !state?.room.id) return;
    const reload = () => {
      void loadRoomState(state.room.roomCode)
        .then(setState)
        .catch(() => undefined);
    };
    const interval = window.setInterval(reload, 5000);
    const client = getBrowserSupabase();
    if (!client) {
      return () => window.clearInterval(interval);
    }
    const channel = client
      .channel(`qmq-entry:${state.room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "qmq_students", filter: `room_id=eq.${state.room.id}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "qmq_ubs_teams", filter: `room_id=eq.${state.room.id}` }, reload)
      .subscribe();
    return () => {
      window.clearInterval(interval);
      void client.removeChannel(channel);
    };
  }, [state?.room.id, state?.room.roomCode, step]);

  useEffect(() => {
    if (!duplicateNickname) return;
    window.setTimeout(() => reconnectNoticeRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 0);
  }, [duplicateNickname]);

  useEffect(() => {
    if (!session) return;
    const reload = () => {
      void Promise.all([loadStudentState(session.room.id, session.student.id), loadRoomState(session.room.roomCode)])
        .then(([nextSession, nextState]) => {
          setSession(nextSession);
          setState(nextState);
        })
        .catch(() => undefined);
    };
    const interval = window.setInterval(reload, 5000);
    const client = getBrowserSupabase();
    if (!client) {
      return () => window.clearInterval(interval);
    }
    const channel = client
      .channel(`qmq-player:${session.room.id}:${session.student.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "qmq_rooms", filter: `id=eq.${session.room.id}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "qmq_students", filter: `room_id=eq.${session.room.id}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "qmq_ubs_teams", filter: `room_id=eq.${session.room.id}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "qmq_answers", filter: `room_id=eq.${session.room.id}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "qmq_student_question_releases", filter: `student_id=eq.${session.student.id}` }, reload)
      .subscribe();
    return () => {
      window.clearInterval(interval);
      void client.removeChannel(channel);
    };
  }, [session?.room.id, session?.room.roomCode, session?.student.id]);

  useEffect(() => {
    if (!session) return;
    const nextQuestion = findNextUnansweredQuestion(questions, session);
    if (!nextQuestion) return;
    if (selectedQuestionId === nextQuestion.id) return;
    if (selectedQuestionId && !answersByQuestion.has(selectedQuestionId)) return;
    setSelectedQuestionId(nextQuestion.id);
    setSelectedOptionId("");
    setQuestionStartedAt("");
    setRemainingSeconds(QUESTION_TIME_LIMIT_SECONDS);
    timeoutQuestionRef.current = "";
  }, [answersByQuestion, questions, selectedQuestionId, session]);

  useEffect(() => {
    if (!session || !currentQuestion || currentAnswer) {
      setQuestionStartedAt("");
      setRemainingSeconds(QUESTION_TIME_LIMIT_SECONDS);
      return;
    }
    let cancelled = false;
    setQuestionStartedAt("");
    setRemainingSeconds(QUESTION_TIME_LIMIT_SECONDS);
    void startQuestionTimer({
      roomId: session.room.id,
      studentId: session.student.id,
      questionId: currentQuestion.id
    })
      .then((timer) => {
        if (cancelled) return;
        setQuestionStartedAt(timer.startedAt);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Nao foi possivel iniciar o cronometro."));
    return () => {
      cancelled = true;
    };
  }, [currentAnswer, currentQuestion?.id, session?.room.id, session?.student.id]);

  useEffect(() => {
    if (!questionStartedAt) return;
    const updateRemaining = () => {
      const elapsed = Math.floor((Date.now() - new Date(questionStartedAt).getTime()) / 1000);
      setRemainingSeconds(Math.max(0, QUESTION_TIME_LIMIT_SECONDS - elapsed));
    };
    updateRemaining();
    const interval = window.setInterval(updateRemaining, 250);
    return () => window.clearInterval(interval);
  }, [questionStartedAt]);

  useEffect(() => {
    if (!session?.pendingReleaseExpiresAt || pendingReleaseQuestions.length === 0) {
      setReleaseNoticeSeconds(0);
      return;
    }
    const updateRemaining = () => {
      const remaining = Math.ceil((new Date(session.pendingReleaseExpiresAt ?? "").getTime() - Date.now()) / 1000);
      setReleaseNoticeSeconds(Math.max(0, remaining));
    };
    updateRemaining();
    const interval = window.setInterval(updateRemaining, 250);
    return () => window.clearInterval(interval);
  }, [pendingReleaseQuestions.length, session?.pendingReleaseExpiresAt]);

  useEffect(() => {
    if (!session || pendingReleaseQuestions.length === 0 || releaseNoticeSeconds > 0) return;
    void loadStudentState(session.room.id, session.student.id)
      .then(setSession)
      .catch(() => undefined);
  }, [pendingReleaseQuestions.length, releaseNoticeSeconds, session?.room.id, session?.student.id]);

  useEffect(() => {
    if (!session || !currentQuestion || currentAnswer || remainingSeconds > 0 || timeoutQuestionRef.current === currentQuestion.id) return;
    timeoutQuestionRef.current = currentQuestion.id;
    setBusy(true);
    setError("");
    void answerQuestion({
      roomId: session.room.id,
      studentId: session.student.id,
      questionId: currentQuestion.id,
      selectedOptionId: "TIMEOUT"
    })
      .then(async (answer) => {
        setAnswerFlash({ isCorrect: answer.isCorrect, score: answer.score, timeout: true });
        await delay(850);
        setAnswerFlash(null);
        const nextSession = await loadStudentState(session.room.id, session.student.id);
        setSession(nextSession);
        setState(await loadRoomState(session.room.roomCode));
        setSelectedQuestionId(findNextUnansweredQuestion(questions, nextSession)?.id ?? "");
        setSelectedOptionId("");
        setQuestionStartedAt("");
        setRemainingSeconds(QUESTION_TIME_LIMIT_SECONDS);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Tempo esgotado."))
      .finally(() => setBusy(false));
  }, [currentAnswer, currentQuestion, releasedQuestions, remainingSeconds, session]);

  async function loadRoom(code = roomCode, advance = false) {
    if (code.length !== 6) return;
    setBusy(true);
    setError("");
    try {
      const nextState = await loadRoomState(code);
      setState(nextState);
      if (advance) setStep("student");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sala nao encontrada.");
    } finally {
      setBusy(false);
    }
  }

  async function submitRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextRoomCode = normalizeCode(roomInputRef.current?.value ?? String(formData.get("roomCode") ?? roomCode));
    setRoomCode(nextRoomCode);
    await loadRoom(nextRoomCode, true);
  }

  async function submitStudent(event: FormEvent<HTMLFormElement>, confirmReconnect = false) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextNickname = normalizeName(nicknameInputRef.current?.value ?? String(formData.get("nickname") ?? nickname));
    const nextUbsName = normalizeName(ubsInputRef.current?.value ?? String(formData.get("ubsName") ?? ubsName));
    setNickname(nextNickname);
    setUbsName(nextUbsName);
    setBusy(true);
    setError("");
    setDuplicateNickname(false);
    try {
      const nextSession = await joinRoom(roomCode, nextNickname, nextUbsName, avatarId, confirmReconnect);
      setSession(nextSession);
      setState(await loadRoomState(nextSession.room.roomCode));
      window.localStorage.setItem(LAST_NICKNAME_KEY, nextSession.student.nickname);
      window.localStorage.setItem(SESSION_KEY, JSON.stringify({ roomId: nextSession.room.id, studentId: nextSession.student.id }));
      setStep("quiz");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Falha ao entrar.";
      if (message.includes("NICKNAME_EXISTS")) setDuplicateNickname(true);
      else setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function reconnectStudent() {
    setBusy(true);
    setError("");
    setDuplicateNickname(false);
    try {
      const nextSession = await joinRoom(roomCode, nickname.trim(), ubsName.trim(), avatarId, true);
      setSession(nextSession);
      setState(await loadRoomState(nextSession.room.roomCode));
      window.localStorage.setItem(LAST_NICKNAME_KEY, nextSession.student.nickname);
      window.localStorage.setItem(SESSION_KEY, JSON.stringify({ roomId: nextSession.room.id, studentId: nextSession.student.id }));
      setStep("quiz");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao reentrar.");
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer() {
    if (!session || !currentQuestion || !selectedOptionId) return;
    setBusy(true);
    setError("");
    try {
      const answer = await answerQuestion({
        roomId: session.room.id,
        studentId: session.student.id,
        questionId: currentQuestion.id,
        selectedOptionId
      });
      setAnswerFlash({ isCorrect: answer.isCorrect, score: answer.score });
      await delay(850);
      setAnswerFlash(null);
      const nextSession = await loadStudentState(session.room.id, session.student.id);
      setSession(nextSession);
      setState(await loadRoomState(session.room.roomCode));
      setSelectedQuestionId(findNextUnansweredQuestion(questions, nextSession)?.id ?? "");
      setSelectedOptionId("");
      setQuestionStartedAt("");
      setRemainingSeconds(QUESTION_TIME_LIMIT_SECONDS);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nao foi possivel responder.");
    } finally {
      setBusy(false);
    }
  }

  async function beginReleasedQuestions() {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const nextSession = await startReleasedQuestions({ roomId: session.room.id, studentId: session.student.id });
      setSession(nextSession);
      setState(await loadRoomState(session.room.roomCode));
      setSelectedQuestionId(findNextUnansweredQuestion(questions, nextSession)?.id ?? "");
      setSelectedOptionId("");
      setQuestionStartedAt("");
      setRemainingSeconds(QUESTION_TIME_LIMIT_SECONDS);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nao foi possivel iniciar as novas questoes.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "room") {
    return (
      <main className="app-shell">
        <section className="entry-panel">
          <span className="eyebrow">QuestMED Quiz</span>
          <h1>Entre na sala</h1>
          <form className="entry-form" onSubmit={submitRoom}>
            <input
              autoFocus
              maxLength={6}
              name="roomCode"
              onChange={(event) => setRoomCode(normalizeCode(event.currentTarget.value))}
              onInput={(event) => setRoomCode(normalizeCode(event.currentTarget.value))}
              placeholder="CODIGO"
              ref={roomInputRef}
              type="text"
              defaultValue={roomCode}
            />
            <button disabled={busy} type="submit">Continuar</button>
          </form>
          <a className="teacher-link" href="/professor"><LockKeyhole size={16} /> Area do professor</a>
          {error ? <p className="entry-error">{error}</p> : null}
        </section>
      </main>
    );
  }

  if (step === "student") {
    return (
      <main className="app-shell">
        <section className="entry-panel">
          <span className="eyebrow">Sala {roomCode}</span>
          <h1>Identifique-se</h1>
          <form className="entry-form stacked" onSubmit={submitStudent}>
            <input
              autoFocus
              name="nickname"
              onChange={(event) => setNickname(normalizeName(event.currentTarget.value))}
              onInput={(event) => setNickname(normalizeName(event.currentTarget.value))}
              placeholder="SEU NICKNAME"
              ref={nicknameInputRef}
              type="text"
              value={nickname}
            />
            {canChooseUbs ? (
              <fieldset className="ubs-picker">
                <legend>Escolha sua UBS</legend>
                <div className="ubs-choice-grid">
                  {ubsOptions.map((ubs) => (
                    <button
                      aria-pressed={!addingNewUbs && ubsName === ubs.name}
                      className={!addingNewUbs && ubsName === ubs.name ? "ubs-choice selected" : "ubs-choice"}
                      key={ubs.id}
                      onClick={() => {
                        setAddingNewUbs(false);
                        setUbsName(ubs.name);
                      }}
                      type="button"
                    >
                      {ubs.name}
                      <small>{ubs.memberCount} aluno(s)</small>
                    </button>
                  ))}
                  <button
                    aria-pressed={addingNewUbs}
                    className={addingNewUbs ? "ubs-choice add-new selected" : "ubs-choice add-new"}
                    onClick={() => {
                      setAddingNewUbs(true);
                      setUbsName("");
                      window.setTimeout(() => ubsInputRef.current?.focus(), 0);
                    }}
                    type="button"
                  >
                    Add nova UBS
                  </button>
                </div>
                {addingNewUbs || ubsOptions.length === 0 ? (
                  <input
                    name="ubsName"
                    onChange={(event) => setUbsName(normalizeName(event.currentTarget.value))}
                    onInput={(event) => setUbsName(normalizeName(event.currentTarget.value))}
                    placeholder="NOME DA NOVA UBS"
                    ref={ubsInputRef}
                    type="text"
                    value={ubsName}
                  />
                ) : (
                  <input name="ubsName" ref={ubsInputRef} type="hidden" value={ubsName} />
                )}
              </fieldset>
            ) : null}
            {canChooseAvatar ? (
              <fieldset className="avatar-picker">
                <legend>Escolha seu avatar</legend>
                <div>
                  {AVATAR_PRESETS.map((avatar) => (
                    <button
                      aria-pressed={avatarId === avatar.id}
                      className={avatarId === avatar.id ? "avatar-choice selected" : "avatar-choice"}
                      key={avatar.id}
                      onClick={() => {
                        setAvatarId(avatar.id);
                        window.setTimeout(() => enterButtonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
                      }}
                      type="button"
                    >
                      <AvatarBadge avatarId={avatar.id} className="choice-avatar" name={nickname || avatar.label} />
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <button disabled={busy || !canChooseAvatar} ref={enterButtonRef} type="submit">Entrar</button>
          </form>
          {duplicateNickname ? (
            <div className="notice-card" ref={reconnectNoticeRef}>
              <strong>Este nickname ja existe nesta sala.</strong>
              <p>Se for voce, pode reentrar e continuar a atividade.</p>
              <button disabled={busy} onClick={() => void reconnectStudent()} type="button">Reentrar</button>
            </div>
          ) : null}
          {error ? <p className="entry-error">{error}</p> : null}
        </section>
      </main>
    );
  }

  if (!session) return null;

  return (
    <main className="quiz-shell">
      <section className="phone-stage" aria-label="QuestMED Quiz">
        <header className="topbar">
          <AvatarBadge avatarId={session.student.avatarId} className="player-avatar" name={session.student.nickname} />
          <div>
            <p className="eyebrow">Sala {session.room.roomCode} · {session.ubsTeam.name}</p>
            <h1>{session.student.nickname}</h1>
          </div>
          <div className="score-chip rank-chip">
            <span>{currentStudentRank}o</span>
            <strong>{session.student.totalScore.toFixed(1)}</strong>
            <em className={remainingSeconds <= 15 ? "score-timer danger" : "score-timer"}>
              <Clock3 size={15} /> {String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:{String(remainingSeconds % 60).padStart(2, "0")}
            </em>
          </div>
        </header>

        <div className="question-scroll">
          <div className="meta-row">
            <span className="id-pill">{currentQuestion?.id ?? "----"}</span>
          </div>

          {pendingReleaseQuestions.length > 0 && !currentQuestion ? (
            <section className="new-release-card">
              <span className="eyebrow">Novas perguntas liberadas</span>
              <h2>{pendingReleaseQuestions.length} nova(s) questao(oes)</h2>
              <p>Clique para iniciar este bloco. Se nao iniciar em ate 1 minuto, as questoes serao registradas como tempo esgotado.</p>
              <strong>{String(Math.floor(releaseNoticeSeconds / 60)).padStart(2, "0")}:{String(releaseNoticeSeconds % 60).padStart(2, "0")}</strong>
              <button disabled={busy || releaseNoticeSeconds === 0} onClick={() => void beginReleasedQuestions()} type="button">
                Iniciar respostas
              </button>
            </section>
          ) : allReleasedAnswered ? (
            <section className="completion-panel">
              <span className="eyebrow">Atividade concluida</span>
              <h2>Suas estatisticas</h2>
              <div className="completion-summary">
                <div><span>Respondidas</span><strong>{session.answers.length}/{releasedQuestions.length}</strong></div>
                <div><span>Acertos</span><strong>{session.answers.filter((answer) => answer.isCorrect).length}</strong></div>
                <div><span>Pontos</span><strong>{session.student.totalScore.toFixed(1)}</strong></div>
              </div>
              <div className="completion-answer-list">
                {answeredQuestionStats.map(({ answer, question }) => (
                  <article className={answer.isCorrect ? "completion-answer correct" : "completion-answer"} key={question.id}>
                    <strong>{question.id}</strong>
                    <span>
                      {answer.selectedOptionId === "TIMEOUT"
                        ? "Tempo esgotado"
                        : `Marcada ${getDisplayOptionId(question, session.student.id, answer.selectedOptionId)}`}
                    </span>
                    <b>Gabarito {getDisplayOptionId(question, session.student.id, question.correctOptionId)}</b>
                    <em>{answer.score.toFixed(1)} pts</em>
                  </article>
                ))}
              </div>
            </section>
          ) : !currentQuestion ? (
            <section className="question-card waiting-card">
              <h2>Aguardando questoes liberadas</h2>
              <p>O professor ainda nao liberou questoes para esta sala.</p>
            </section>
          ) : (
            <>
              <section className="question-card" key={currentQuestion.id}>
                <p>{currentQuestion.statement}</p>
              </section>

              <section className="options-list" aria-label="Alternativas">
                {shuffledCurrentOptions.map(({ option, displayId }) => {
                  const selected = selectedOptionId === option.id;
                  const correct = currentAnswer && option.id === currentQuestion.correctOptionId;
                  const wrong = currentAnswer && currentAnswer.selectedOptionId === option.id && !currentAnswer.isCorrect;
                  return (
                    <button
                      className={["option-button", selected ? "selected" : "", correct ? "correct" : "", wrong ? "incorrect" : ""].join(" ")}
                      disabled={busy || Boolean(currentAnswer)}
                      key={option.id}
                      onClick={() => setSelectedOptionId(option.id)}
                      type="button"
                    >
                      <span className="option-letter">{displayId}</span>
                      <span>{option.text}</span>
                    </button>
                  );
                })}
              </section>

              <section className="feedback-zone">
                {currentAnswer ? (
                  <div className={currentAnswer.isCorrect ? "result-card correct" : "result-card incorrect"}>
                    <strong>{currentAnswer.isCorrect ? "CORRETA" : "INCORRETA"}</strong>
                    <span>{currentAnswer.score.toFixed(1)} ponto(s)</span>
                  </div>
                ) : null}
              </section>
            </>
          )}
        </div>

        {currentQuestion && !currentAnswer && !allReleasedAnswered ? (
          <button className="floating-confirm-button" disabled={busy || !selectedOptionId || remainingSeconds === 0} onClick={() => void submitAnswer()} type="button" aria-label="Confirmar resposta">
            <Check size={28} />
          </button>
        ) : null}
        {answerFlash ? <AnswerFlash isCorrect={answerFlash.isCorrect} score={answerFlash.score} timeout={answerFlash.timeout} /> : null}
        {error ? <p className="floating-error">{error}</p> : null}
      </section>

      <aside className="live-panel">
        <section>
          <span className="eyebrow">Ranking UBS</span>
          {teamRanking.map((team, index) => (
            <div className="rank-row" key={team.id}>
              <strong>{index + 1}</strong>
              <span>{team.name}<small>{team.memberCount} aluno(s)</small></span>
              <b>{team.averageScore.toFixed(1)}</b>
            </div>
          ))}
        </section>
        <section>
          <span className="eyebrow">Individual</span>
          {individualRanking.slice(0, 8).map((student, index) => (
            <div className={student.id === session.student.id ? "rank-row active" : "rank-row"} key={student.id}>
              <AvatarBadge avatarId={student.avatarId} className="rank-avatar" name={student.nickname} />
              <span>{student.nickname}</span>
              <b>{student.totalScore.toFixed(1)}</b>
            </div>
          ))}
        </section>
      </aside>
    </main>
  );
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function findNextUnansweredQuestion(questions: QuizQuestion[], session: StudentSessionState) {
  const answeredIds = new Set(session.answers.map((answer) => answer.questionId));
  const pendingIds = new Set(session.pendingReleaseQuestionIds ?? []);
  return questions
    .filter((question) => session.room.releasedQuestionIds.includes(question.id) && !pendingIds.has(question.id))
    .find((question) => !answeredIds.has(question.id));
}

function getStudentQuestionOptions(question: QuizQuestion, studentId: string) {
  return seededShuffle(question.options, `${studentId}:${question.id}`).map((option, index) => ({
    option,
    displayId: DISPLAY_OPTION_IDS[index] ?? option.id
  }));
}

function getDisplayOptionId(question: QuizQuestion, studentId: string, optionId: QuestionOption["id"]) {
  return getStudentQuestionOptions(question, studentId).find((item) => item.option.id === optionId)?.displayId ?? optionId;
}

function seededShuffle<T>(items: T[], seedText: string) {
  const nextItems = [...items];
  let seed = hashSeed(seedText);
  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    seed = nextRandomSeed(seed);
    const swapIndex = seed % (index + 1);
    [nextItems[index], nextItems[swapIndex]] = [nextItems[swapIndex], nextItems[index]];
  }
  return nextItems;
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextRandomSeed(seed: number) {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

function AnswerFlash({ isCorrect, score, timeout }: { isCorrect: boolean; score: number; timeout?: boolean }) {
  return (
    <div className={isCorrect ? "answer-flash correct" : "answer-flash incorrect"} role="status" aria-live="polite">
      <span>{isCorrect ? <Check size={56} /> : <X size={56} />}</span>
      <strong>{timeout ? "Tempo esgotado" : isCorrect ? "Correta" : "Incorreta"}</strong>
      <em>{score.toFixed(1)} pts</em>
    </div>
  );
}
