const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

export interface DecodedImageData {
  blob: Blob;
  bytes: Uint8Array;
  extension: string;
  mediaType: string;
}

export function decodeImageDataUrl(source: string): DecodedImageData {
  if (!source.startsWith("data:image/")) throw new Error("Preview image source is not an image data URL.");
  const comma = source.indexOf(",");
  if (comma < 0) throw new Error("Preview image data URL is malformed.");

  const metadata = source.slice(5, comma).split(";");
  const mediaType = metadata[0].toLowerCase();
  const extension = IMAGE_EXTENSIONS[mediaType];
  if (!extension) throw new Error(`Unsupported preview image type: ${mediaType}`);

  const payload = source.slice(comma + 1);
  const bytes = metadata.includes("base64")
    ? Uint8Array.from(atob(payload), (character) => character.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));
  return { blob: new Blob([bytes], { type: mediaType }), bytes, extension, mediaType };
}

function renderPng(blob: Blob) {
  return new Promise<Blob>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context || !canvas.width || !canvas.height) {
        reject(new Error("Could not prepare the preview image for the clipboard."));
        return;
      }
      context.drawImage(image, 0, 0);
      canvas.toBlob(
        (png) => (png ? resolve(png) : reject(new Error("Could not encode the preview image as PNG."))),
        "image/png",
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode the preview image."));
    };
    image.src = url;
  });
}

export async function copyImageDataUrl(source: string) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Image clipboard access is unavailable in this runtime.");
  }

  const decoded = decodeImageDataUrl(source);
  const png = decoded.mediaType === "image/png" ? Promise.resolve(decoded.blob) : renderPng(decoded.blob);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}
