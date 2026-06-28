import questionsData from "../../../data/questions.json";
import { ResolverAdminDashboard } from "../../components/ResolverAdminDashboard";
import type { QuizQuestion } from "../../types";

export default function ProfessorResolverPage() {
  return <ResolverAdminDashboard questions={questionsData as QuizQuestion[]} />;
}
