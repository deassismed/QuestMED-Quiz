export type AvatarPreset = {
  id: string;
  label: string;
  src: string;
};

export const AVATAR_PRESETS: AvatarPreset[] = Array.from({ length: 72 }, (_, index) => {
  const number = String(index + 1).padStart(2, "0");
  return {
    id: `avatar-${number}`,
    label: `Avatar ${number}`,
    src: `/avatars/avatar-${number}.webp`
  };
});

export const DEFAULT_AVATAR_ID = AVATAR_PRESETS[0].id;

export function getAvatarPreset(value: string | null | undefined) {
  return AVATAR_PRESETS.find((avatar) => avatar.id === value) ?? AVATAR_PRESETS[0];
}

export function isAvatarId(value: string | null | undefined) {
  return AVATAR_PRESETS.some((avatar) => avatar.id === value);
}

export function normalizeAvatarId(value: string | null | undefined) {
  if (isAvatarId(value)) return String(value);
  return DEFAULT_AVATAR_ID;
}
