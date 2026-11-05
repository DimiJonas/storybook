// The cover photo ("Titelbild") of a memory: the one chosen in the edit form (cover_image_id),
// otherwise – for memories saved before covers could be chosen – the first photo. null without photos.
export const coverPhoto = (memory) =>
  memory.images?.find((image) => image.id === memory.cover_image_id) ?? memory.images?.[0] ?? null;
