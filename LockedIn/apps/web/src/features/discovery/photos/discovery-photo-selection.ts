const bytesPerMiB = 1024 * 1024;
const maxMiB = 5;
const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
export const discoveryPhotoAccept = allowedTypes.join(",");

export function readDiscoveryPhotoSelection(input: Pick<HTMLInputElement, "files" | "value">) {
  const file = input.files?.[0];
  if (!file) return { file: null, error: "" };

  let error = "";
  if (!allowedTypes.includes(file.type)) {
    error = file.type
      ? "This file format isn’t supported. Choose a still JPEG, PNG, or WebP photo."
      : "We couldn’t identify the file format. Try exporting it as JPEG, PNG, or WebP.";
  } else if (file.size > maxMiB * bytesPerMiB) {
    const size = (file.size / bytesPerMiB).toFixed(2);
    error = size === "5.00"
      ? "This photo is just over the 5 MiB limit. Choose a smaller photo."
      : `This photo is ${size} MiB. The limit is 5 MiB. Choose a smaller photo.`;
  } else if (file.size === 0) {
    error = "This photo file is empty. Choose another photo.";
  }

  if (error) {
    input.value = "";
    return { file: null, error };
  }
  return { file, error: "" };
}
