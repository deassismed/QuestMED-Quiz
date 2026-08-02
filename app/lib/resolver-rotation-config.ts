export const RESOLVER_ROTATIONS = [
  { id: "p9-mfc1-r4", name: "P9 - MFC I - 4º rodízio", acceptsAnswers: true },
  { id: "p11-mfc2-r4", name: "P11 - MFC II - 4º rodízio", acceptsAnswers: false }
] as const;

export type ResolverRotationId = (typeof RESOLVER_ROTATIONS)[number]["id"];
export const DEFAULT_RESOLVER_ROTATION_ID: ResolverRotationId = "p9-mfc1-r4";
export const LEGACY_RESOLVER_ROTATION_ID: ResolverRotationId = "p11-mfc2-r4";

export function isResolverRotationId(value: string): value is ResolverRotationId {
  return RESOLVER_ROTATIONS.some((rotation) => rotation.id === value);
}

export function requireResolverRotationId(value: unknown): ResolverRotationId {
  if (typeof value !== "string" || !isResolverRotationId(value)) throw new Error("Rodízio inválido.");
  return value;
}

export function resolverRotationAcceptsAnswers(rotationId: ResolverRotationId) {
  return RESOLVER_ROTATIONS.find((rotation) => rotation.id === rotationId)?.acceptsAnswers === true;
}
