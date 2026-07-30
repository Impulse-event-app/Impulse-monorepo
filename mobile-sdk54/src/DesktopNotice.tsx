// DesktopNotice.tsx — native no-op. A phone build is never "on desktop", so
// the whole notice (and its QR dependency) is compiled out of iOS/Android
// bundles. The real implementation lives in DesktopNotice.web.tsx, which Metro
// picks automatically for the web platform — same convention as MapScreen.
export function DesktopNotice() {
  return null;
}
