import questionsData from "../../../../data/questions.json";
import { TeacherDashboard } from "../../../components/TeacherDashboard";
import { getRoomPublicStateById, validateAdmin } from "../../../lib/online-server";
import type { QuizQuestion } from "../../../types";

export default async function AdminRoomPage({
  params
}: {
  params: Promise<{ roomId: string; adminKey: string }>;
}) {
  const { roomId, adminKey } = await params;
  const valid = await validateAdmin(roomId, adminKey);
  if (!valid) {
    return (
      <main className="admin-shell">
        <section className="empty-state">
          <span className="eyebrow">Acesso negado</span>
          <h1>Chave administrativa invalida.</h1>
        </section>
      </main>
    );
  }
  return <TeacherDashboard adminKey={adminKey} initialState={await getRoomPublicStateById(roomId)} questions={questionsData as QuizQuestion[]} />;
}
