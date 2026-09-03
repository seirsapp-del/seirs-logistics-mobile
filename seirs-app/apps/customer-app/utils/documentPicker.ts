/**
 * The optional file picker, shared by every screen that accepts a document.
 *
 * WHY this is not a plain import. expo-document-picker is a NATIVE module.
 * A build made before it was added has no such module, and a top-level
 * import throws while the module is being evaluated. That happens at
 * launch, which takes down the router and every route in the app rather
 * than just the screen that wanted a PDF. So the native registry is asked
 * first, the JS wrapper is required lazily, and a rider on an older build
 * is quietly offered photos only while the app still opens.
 *
 * Copied from the driver app, which solved this first. A Nigerian NIN slip
 * arrives from the NIMC portal as a PDF download, so photographing it is the
 * wrong shape: the customer verify-identity screen offered camera and gallery
 * only, which forces a photo of a phone screen, which is exactly the
 * unreadable document that gets a submission rejected.
 */

import { requireOptionalNativeModule } from 'expo-modules-core';

/** Anything larger fails halfway through an upload on a Lagos connection. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export type PickedDocument = { uri: string; mimeType: string; name: string | null };

/**
 * undefined = not yet tried, null = the native module is genuinely absent.
 * Resolved once and remembered.
 */
let cachedPicker: typeof import('expo-document-picker') | null | undefined;

export function getDocumentPicker() {
  if (cachedPicker === undefined) {
    if (!requireOptionalNativeModule('ExpoDocumentPicker')) {
      cachedPicker = null;
    } else {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        cachedPicker = require('expo-document-picker');
      } catch {
        cachedPicker = null;
      }
    }
  }
  return cachedPicker;
}

/** True when this build can honour a file attachment at all. */
export function canAttachFiles(): boolean {
  return getDocumentPicker() !== null;
}

/**
 * Pick one PDF or image. Returns null when cancelled or unavailable, and
 * calls onError with something a rider can act on rather than throwing.
 *
 * The mime type travels with the uri because the upload helper defaults to
 * image/jpeg, which would store a PDF under a type nothing can open.
 */
export async function pickDocument(
  onError: (title: string, message: string) => void,
): Promise<PickedDocument | null> {
  const picker = getDocumentPicker();
  if (!picker) {
    onError(
      'Update the app first',
      'Attaching a file needs a newer version of SEIRS. Take a photo of the document instead, or update from the Play Store.',
    );
    return null;
  }
  try {
    const r = await picker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (r.canceled || !r.assets?.length) return null;
    const a = r.assets[0];
    if (a.size && a.size > MAX_DOCUMENT_BYTES) {
      onError('File too large', 'That file is over 10MB. Send a smaller scan or a photo instead.');
      return null;
    }
    return {
      uri:      a.uri,
      mimeType: a.mimeType ?? 'application/pdf',
      name:     a.name ?? null,
    };
  } catch {
    onError('Could not open that file', 'Try again, or take a photo of the document instead.');
    return null;
  }
}
