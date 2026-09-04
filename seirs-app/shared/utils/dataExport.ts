/**
 * Turning a person's data export into something they can keep.
 *
 * WHY THIS EXISTS. "Download my data" used to promise an email that no
 * template, queue or cron ever sent, so anyone exercising their NDPR right
 * got a reassuring message and nothing, permanently. That was fixed by filing
 * the export into the Documents shelf, but as HTML, and that shelf renders a
 * document's body in a plain Text view. So what a person actually saw when
 * they asked for their own data was raw markup opening with <!doctype html>,
 * and sharing it shared the markup. The founder found it on 2026-09-04.
 *
 * The shelf copy is now plain text, which reads correctly today. This module
 * is the other half: a real PDF, and the machine-readable copy.
 *
 * WHY THE PDF IS MADE ON THE PHONE. The alternative was rendering it on the
 * server and handing back a link, the way statements work. A statement link
 * is deliberately public so it can be forwarded to an accountant. This
 * document is a person's entire record with SEIRS: their profile, every
 * delivery, every address. A forwardable URL to that is a leak waiting for
 * someone to paste it, and openURL cannot carry an auth token, so the link
 * would have to be publicly reachable. Rendering locally means the file never
 * leaves the device except where its owner sends it.
 */
import { requireOptionalNativeModule } from 'expo-modules-core';

export type ExportOutcome =
  | { ok: true;  shared: boolean; uri: string }
  | { ok: false; reason: 'unavailable' | 'failed'; message: string };

/**
 * Is this build able to make a PDF at all?
 *
 * expo-print is native, so a JS bundle can reference it while the installed
 * APK has no such module. Asking the registry FIRST is the rule this codebase
 * already follows for expo-navigation-bar, and it exists because a top-level
 * import of a missing native module throws while the module is evaluating,
 * at launch, taking the router and every route with it. That is exactly how
 * the document picker took the whole app down on 2026-08-31.
 */
export function canMakePdf(): boolean {
  return Boolean(requireOptionalNativeModule('ExpoPrint'));
}

/**
 * Render the export HTML to a PDF and offer it to the person.
 *
 * Never throws. A data export is something someone asks for when they are
 * already unhappy or leaving, and the worst possible answer is a crash.
 */
export async function savePdf(html: string, fileLabel = 'SEIRS data'): Promise<ExportOutcome> {
  if (!canMakePdf()) {
    return {
      ok: false,
      reason: 'unavailable',
      message: 'This version of the app cannot make a PDF yet. Your data is in Documents and can be read and shared from there.',
    };
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Print = require('expo-print');
    const { uri } = await Print.printToFileAsync({ html, base64: false });

    // Sharing is a separate native module and a separate question: a build
    // can make the file and still have nowhere to send it.
    if (requireOptionalNativeModule('ExpoSharing')) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Sharing = require('expo-sharing');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: fileLabel,
          UTI: 'com.adobe.pdf',
        });
        return { ok: true, shared: true, uri };
      }
    }
    return { ok: true, shared: false, uri };
  } catch (e: any) {
    return {
      ok: false,
      reason: 'failed',
      message: e?.message ?? 'The PDF could not be made. Your data is still in Documents.',
    };
  }
}

/**
 * The machine-readable copy.
 *
 * NDPR Article 24 is a portability right, and portability means a format
 * another system can read. A PDF is not that. The endpoint has served JSON
 * since it was written and no app ever called it, so until now the only copy
 * anyone could actually obtain was the human-readable one.
 *
 * Shared as a file rather than displayed: nobody reads their own JSON on a
 * phone screen, they send it somewhere.
 */
export async function saveJson(bundle: any, fileLabel = 'SEIRS data (machine readable)'): Promise<ExportOutcome> {
  try {
    /**
     * 'FileSystem', not 'ExpoFileSystem'.
     *
     * The name is taken from Name() in the module's own Kotlin source, not
     * guessed from the package name, because a guessed name does not fail
     * loudly: requireOptionalNativeModule returns null and the feature
     * reports itself permanently unavailable on a build that supports it
     * perfectly well. My first pass here had ExpoFileSystem and would have
     * done exactly that. The module registers both names.
     */
    const FileSystem = requireOptionalNativeModule('FileSystem')
      ?? requireOptionalNativeModule('ExponentFileSystem');
    const canShare   = requireOptionalNativeModule('ExpoSharing');
    if (!FileSystem || !canShare) {
      return {
        ok: false,
        reason: 'unavailable',
        message: 'This version of the app cannot save the machine-readable copy yet.',
      };
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FS = require('expo-file-system');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sharing = require('expo-sharing');

    const uri = `${FS.cacheDirectory}seirs-data.json`;
    await FS.writeAsStringAsync(uri, JSON.stringify(bundle, null, 2));
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/json',
        dialogTitle: fileLabel,
        UTI: 'public.json',
      });
      return { ok: true, shared: true, uri };
    }
    return { ok: true, shared: false, uri };
  } catch (e: any) {
    return {
      ok: false,
      reason: 'failed',
      message: e?.message ?? 'The machine-readable copy could not be saved.',
    };
  }
}
