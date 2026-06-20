"use client";

import { Copy, ExternalLink, Loader2, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { accessRoom, createRoom, listRooms } from "../lib/online-client";
import type { CreateRoomResult, ProfessorRoomSummary } from "../types";

export function RoomCreator() {
  const [password, setPassword] = useState("");
  const [roomName, setRoomName] = useState("");
  const [rooms, setRooms] = useState<ProfessorRoomSummary[]>([]);
  const [created, setCreated] = useState<CreateRoomResult | null>(null);
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  const [openingRoomId, setOpeningRoomId] = useState("");
  const [error, setError] = useState("");
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const roomNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setOrigin(window.location.origin), []);

  const studentUrl = useMemo(() => (created && origin ? `${origin}/?sala=${created.room.roomCode}` : ""), [created, origin]);
  const adminUrl = useMemo(() => (created && origin ? `${origin}/professor/${created.room.id}/${created.adminKey}` : ""), [created, origin]);

  async function loadExistingRooms(currentPassword = password) {
    setBusy(true);
    setError("");
    try {
      const data = await listRooms(currentPassword);
      setRooms(data.rooms as ProfessorRoomSummary[]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nao foi possivel listar salas.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextPassword = passwordInputRef.current?.value ?? String(formData.get("password") ?? password);
    const nextRoomName = roomNameInputRef.current?.value ?? String(formData.get("roomName") ?? roomName);
    setPassword(nextPassword);
    setRoomName(nextRoomName);
    setBusy(true);
    setError("");
    try {
      const result = await createRoom(nextRoomName, nextPassword);
      setCreated(result);
      setRoomName("");
      await loadExistingRooms(nextPassword);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nao foi possivel criar sala.");
    } finally {
      setBusy(false);
    }
  }

  async function openExistingRoom(roomId: string) {
    if (openingRoomId) return;
    const nextPassword = passwordInputRef.current?.value ?? password;
    setPassword(nextPassword);
    setOpeningRoomId(roomId);
    setError("");
    try {
      if (!nextPassword) throw new Error("Informe a senha do professor para acessar a sala.");
      const result = await accessRoom(roomId, nextPassword);
      window.location.assign(`/professor/${result.room.id}/${result.adminKey}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nao foi possivel acessar a sala.");
      setOpeningRoomId("");
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-title">
        <span className="eyebrow">QuestMED Quiz</span>
        <h1>Area do professor</h1>
        <p>Crie salas, compartilhe o codigo com os alunos e acompanhe UBS e pontuacoes.</p>
      </header>

      <section className="create-room-panel">
        <form className="create-room-controls" onSubmit={submitCreateRoom}>
          <label>Senha do professor</label>
          <input
            onChange={(event) => setPassword(event.currentTarget.value)}
            onInput={(event) => setPassword(event.currentTarget.value)}
            name="password"
            placeholder="Senha"
            ref={passwordInputRef}
            type="password"
            defaultValue={password}
          />
          <label>Nome da sala</label>
          <input
            onChange={(event) => setRoomName(event.currentTarget.value)}
            onInput={(event) => setRoomName(event.currentTarget.value)}
            name="roomName"
            placeholder="Turma MFC - manha"
            ref={roomNameInputRef}
            type="text"
            defaultValue={roomName}
          />
          <button className="primary-command" disabled={busy} type="submit">
            {busy ? <Loader2 className="spin" size={18} /> : <Plus size={18} />} Criar sala
          </button>
          <button
            className="secondary-command"
            disabled={busy}
            onClick={(event) => {
              const form = event.currentTarget.form;
              const formData = form ? new FormData(form) : null;
              void loadExistingRooms(passwordInputRef.current?.value ?? String(formData?.get("password") ?? password));
            }}
            type="button"
          >
            Atualizar salas
          </button>
        </form>
      </section>

      {created ? (
        <section className="room-created-panel">
          <div className="room-created-copy">
            <span className="eyebrow">Sala criada</span>
            <h2 className="created-room-name">{created.room.roomName || "QuestMED Quiz"}</h2>
            <strong className="room-code-display">{created.room.roomCode}</strong>
            <ShareField label="Link dos alunos" value={studentUrl} />
            <ShareField label="Painel administrativo" value={adminUrl} />
            <a className="primary-command" href={adminUrl}>
              <ExternalLink size={18} /> Abrir painel da sala
            </a>
          </div>
        </section>
      ) : null}

      {error ? <p className="entry-error">{error}</p> : null}

      <section className="existing-rooms-panel">
        <div className="existing-rooms-heading">
          <div>
            <span className="eyebrow">Historico</span>
            <h2>Salas recentes</h2>
          </div>
        </div>
        <div className="room-list">
          {rooms.map((summary) => (
            <article
              aria-busy={openingRoomId === summary.room.id}
              aria-label={`Abrir sala ${summary.room.roomCode}`}
              className={`room-list-item ${summary.room.status} ${openingRoomId === summary.room.id ? "opening" : ""}`}
              key={summary.room.id}
              onClick={() => void openExistingRoom(summary.room.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") void openExistingRoom(summary.room.id);
              }}
              role="button"
              tabIndex={0}
            >
              <div className="room-list-code">
                <div>
                  <span>Codigo</span>
                  <strong>{summary.room.roomCode}</strong>
                </div>
                <span className={`room-status ${summary.room.status}`}>{summary.room.status}</span>
              </div>
              <p>{summary.room.roomName || "Sem nome"}</p>
              <div className="room-list-metrics">
                <span><strong>{summary.studentCount}</strong> alunos</span>
                <span><strong>{summary.ubsCount}</strong> UBS</span>
                <span><strong>{summary.averageTeamScore.toFixed(1)}</strong> media</span>
              </div>
              <div className="room-list-footer">
                <small>{summary.lastActivityAt ? new Date(summary.lastActivityAt).toLocaleString("pt-BR") : "Sem atividade"}</small>
                <span className="room-open-hint">
                  {openingRoomId === summary.room.id ? <Loader2 className="spin" size={16} /> : null}
                  {openingRoomId === summary.room.id ? "Abrindo..." : "Clique para entrar"}
                </span>
              </div>
            </article>
          ))}
          {rooms.length === 0 ? <p className="empty-room-list">Informe a senha e atualize para ver as salas.</p> : null}
        </div>
      </section>
    </main>
  );
}

function ShareField({ label, value }: { label: string; value: string }) {
  return (
    <label className="share-field">
      <span>{label}</span>
      <div>
        <input readOnly value={value} />
        <button aria-label={`Copiar ${label}`} onClick={() => void navigator.clipboard.writeText(value)} type="button">
          <Copy size={17} />
        </button>
      </div>
    </label>
  );
}
