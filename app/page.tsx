import questionsData from "../data/questions.json";
import questionCommentsData from "../data/questions_coments.json";
import { QuizPlayer } from "./components/QuizPlayer";
import type { QuestionComment, QuizQuestion } from "./types";

export default function Home() {
  return (
    <QuizPlayer
      questionComments={(questionCommentsData as { items: QuestionComment[] }).items}
      questions={questionsData as QuizQuestion[]}
    />
  );
}
