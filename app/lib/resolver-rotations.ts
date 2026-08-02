import p9QuestionsData from "../../data/questions.json";
import p9CommentsData from "../../data/questions_coments.json";
import p11QuestionsData from "../../data/questions - Copia.json";
import p11CommentsData from "../../data/questions_coments - Copia.json";
import type { QuestionComment, QuizQuestion } from "../types";
import { RESOLVER_ROTATIONS, type ResolverRotationId } from "./resolver-rotation-config";

export type ResolverRotation = {
  id: ResolverRotationId;
  name: string;
  acceptsAnswers: boolean;
  questions: QuizQuestion[];
  comments: QuestionComment[];
};

const questionBanks: Record<ResolverRotationId, QuizQuestion[]> = {
  "p9-mfc1-r4": p9QuestionsData as QuizQuestion[],
  "p11-mfc2-r4": p11QuestionsData as QuizQuestion[]
};

const commentBanks: Record<ResolverRotationId, QuestionComment[]> = {
  "p9-mfc1-r4": (p9CommentsData as { items: QuestionComment[] }).items,
  "p11-mfc2-r4": (p11CommentsData as { items: QuestionComment[] }).items
};

export const resolverRotations: ResolverRotation[] = RESOLVER_ROTATIONS.map((rotation) => ({
  ...rotation,
  questions: questionBanks[rotation.id],
  comments: commentBanks[rotation.id]
}));
