/** Decode a compressed item photo without fetch(), which CSP correctly restricts. */
export function reportPhotoBlob(image: string): Blob {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if (!match) throw new Error("Use a JPG, PNG or WebP photo");
  if (match[2].length > Math.ceil(2_097_152 / 3) * 4) throw new Error("Photo must be under 2 MB after compression");
  let decoded: string;
  try { decoded = atob(match[2]); } catch { throw new Error("Invalid photo data"); }
  if (!decoded.length) throw new Error("Invalid photo data");
  if (decoded.length > 2_097_152) throw new Error("Photo must be under 2 MB after compression");
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: match[1] });
}
