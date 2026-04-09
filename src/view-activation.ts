export interface ViewActivationTarget<T> {
  leaf: T | null;
  reused: boolean;
}

export function pickLeafForViewActivation<T>(
  existingLeaves: T[],
  createLeaf: () => T | null,
): ViewActivationTarget<T> {
  const existingLeaf = existingLeaves[0] ?? null;
  if (existingLeaf) {
    return {
      leaf: existingLeaf,
      reused: true,
    };
  }

  return {
    leaf: createLeaf(),
    reused: false,
  };
}
