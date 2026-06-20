import { NextResponse } from "next/server";
import { createOnlineRoom, createRoomAdminAccess, listProfessorRooms, validateProfessorPassword } from "../../../lib/online-server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { roomName?: string; password?: string };
    if (!validateProfessorPassword(body.password ?? "")) throw new Error("Senha do professor invalida.");
    return NextResponse.json(await createOnlineRoom(body.roomName));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel criar a sala." }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { password?: string };
    if (!validateProfessorPassword(body.password ?? "")) throw new Error("Senha do professor invalida.");
    return NextResponse.json({ rooms: await listProfessorRooms() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel listar as salas." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { roomId?: string; password?: string };
    if (!validateProfessorPassword(body.password ?? "")) throw new Error("Senha do professor invalida.");
    if (!body.roomId) throw new Error("Sala invalida.");
    return NextResponse.json(await createRoomAdminAccess(body.roomId));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nao foi possivel acessar a sala." }, { status: 400 });
  }
}
