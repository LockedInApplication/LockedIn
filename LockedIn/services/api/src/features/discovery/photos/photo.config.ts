export function parsePhotoConfig(source: Record<string, string | undefined>) {
  const cloudName = source.CLOUDINARY_CLOUD_NAME?.trim() ?? "";
  const apiKey = source.CLOUDINARY_API_KEY?.trim() ?? "";
  const apiSecret = source.CLOUDINARY_API_SECRET?.trim() ?? "";
  return { enabled: source.DISCOVERY_PHOTOS_ENABLED === "true", configured: /^[a-zA-Z0-9_-]+$/.test(cloudName) && !!apiKey && !!apiSecret, cloudName, apiKey, apiSecret };
}
export const getPhotoConfig = () => parsePhotoConfig(process.env);
export function photoCapabilities() { const { enabled, configured } = getPhotoConfig(); return { enabled, configured }; }
