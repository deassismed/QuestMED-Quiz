import { PublicScoreboard } from "../../components/PublicScoreboard";
import { getRoomPublicState } from "../../lib/online-server";

export default async function StatusPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  const state = await getRoomPublicState(roomCode);
  return <PublicScoreboard initialState={state} />;
}
