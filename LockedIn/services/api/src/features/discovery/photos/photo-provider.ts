import { createCloudinaryPhotoProvider } from "./photo-cloudinary.js";
import { getPhotoConfig } from "./photo.config.js";
/** Production has no fake-provider switch. Tests inject providers into services explicitly. */
export const getPhotoProvider = () => createCloudinaryPhotoProvider(getPhotoConfig());
