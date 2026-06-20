import questionsData from "../data/questions.json";
import { QuizPlayer } from "./components/QuizPlayer";
import type { QuizQuestion } from "./types";

export default function Home() {
  return <QuizPlayer questions={questionsData as QuizQuestion[]} />;
}
