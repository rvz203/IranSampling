import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { storage } from "./storage";
import type { Identity } from "./types";

export async function pickPhoto(
  camera: boolean,
): Promise<ImagePicker.ImagePickerAsset | null> {
  if (camera) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted)
      throw new Error("دسترسی دوربین را از تنظیمات دستگاه فعال کنید.");
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: false,
    exif: false,
    quality: 0.8,
  };
  const result = camera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  return result.canceled ? null : (result.assets[0] ?? null);
}

export async function enqueuePhoto(
  auth: Identity,
  shiftId: string,
  asset: ImagePicker.ImagePickerAsset,
  caption: string,
) {
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > 1800) {
    context.resize(
      asset.width >= asset.height ? { width: 1800 } : { height: 1800 },
    );
  }
  const image = await context.renderAsync();
  const result = await image.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.78,
  });
  const file = new File(result.uri);
  try {
    if (file.size > 8 * 1024 * 1024)
      throw new Error("تصویر از حد ۸ مگابایت بزرگ‌تر است.");
    await storage.addPhoto(
      auth,
      shiftId,
      Crypto.randomUUID(),
      result.uri,
      caption.trim(),
    );
  } finally {
    if (file.exists) file.delete();
  }
}
