import questionsData from "../../data/questions.json";
import type { QuizQuestion } from "../types";

export const questions = questionsData as QuizQuestion[];

export const QUESTION_TIME_LIMIT_SECONDS = 90;

export function getQuestion(questionId: string) {
  const question = questions.find((item) => item.id === questionId.toUpperCase());
  if (!question) throw new Error("Questao nao encontrada.");
  return question;
}

export function calculateAnswerScore(isCorrect: boolean, elapsedSeconds: number) {
  if (!isCorrect) return 0;
  const clampedElapsed = Math.min(Math.max(elapsedSeconds, 0), QUESTION_TIME_LIMIT_SECONDS);
  const remainingRatio = Math.max(0, QUESTION_TIME_LIMIT_SECONDS - clampedElapsed) / QUESTION_TIME_LIMIT_SECONDS;
  return Number((10 * remainingRatio).toFixed(1));
}
