// Permanent, version-less URL for the latest Windows installer. It always serves the current
// release, so the website never needs editing when a new Colega version ships.
export const WINDOWS_DOWNLOAD_URL = "https://updates.colegapro.com/ColegaSetup.exe";

export function isExternalHref(href: string) {
  return /^https?:\/\//.test(href);
}
