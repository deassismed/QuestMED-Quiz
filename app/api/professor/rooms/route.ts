import { NextResponse } from "next/server";
import { createOnlineRoom, createRoomAdminAccess, deleteOnlineRoom, listProfessorRooms, validateProfessorPassword } from "../../../lib/online-server";

function professorRoomError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const isConnectionError = /abort|timeout|fetch|network|econn|socket|522|signal/i.test(message);
  return NextResponse.json(
    { error: isConnectionError ? "Supabase nao respondeu. Verifique se o projeto esta ativo e as chaves estao corretas." : message },
    { status: isConnectionError ? 503 : 400 }
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { roomName?: string; password?: string };
    if (!validateProfessorPassword(body.password ?? "")) throw new Error("Senha do professor invalida.");
    return NextResponse.json(await createOnlineRoom(body.roomName));
  } catch (error) {
    return professorRoomError(error, "Nao foi possivel criar a sala.");
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { password?: string };
    if (!validateProfessorPassword(body.password ?? "")) throw new Error("Senha do professor invalida.");
    return NextResponse.json({ rooms: await listProfessorRooms() });
  } catch (error) {
    return professorRoomError(error, "Nao foi possivel listar as salas.");
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { roomId?: string; password?: string };
    if (!validateProfessorPassword(body.password ?? "")) throw new Error("Senha do professor invalida.");
    if (!body.roomId) throw new Error("Sala invalida.");
    return NextResponse.json(await createRoomAdminAccess(body.roomId));
  } catch (error) {
    return professorRoomError(error, "Nao foi possivel acessar a sala.");
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { roomId?: string; password?: string };
    if (!validateProfessorPassword(body.password ?? "")) throw new Error("Senha do professor invalida.");
    if (!body.roomId) throw new Error("Sala invalida.");
    await deleteOnlineRoom(body.roomId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return professorRoomError(error, "Nao foi possivel excluir a sala.");
  }
}
