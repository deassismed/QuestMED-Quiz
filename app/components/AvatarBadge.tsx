import { getAvatarPreset } from "../lib/avatars";

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function AvatarBadge({
  avatarId,
  className = "",
  name
}: {
  avatarId?: string | null;
  className?: string;
  name: string;
}) {
  const avatar = getAvatarPreset(avatarId);
  return (
    <div
      aria-label={`Avatar de ${name}`}
      className={["avatar-badge", "image-avatar", className].filter(Boolean).join(" ")}
      data-initials={initials(name)}
    >
      <img alt="" draggable={false} src={avatar.src} />
    </div>
  );
}
