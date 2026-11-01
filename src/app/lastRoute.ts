// Reopening the installed app returns to the screen that was open last.
// The manifest's start_url carries `?source=pwa`; every other visit opens the URL as given.

export const LAST_ROUTE_KEY = "pesa-last-route";

const NOT_REMEMBERED = ["/sign-in", "/dev/"];

export function rememberRoute(pathname: string, search = "") {
  if (NOT_REMEMBERED.some((prefix) => pathname.startsWith(prefix))) return;
  try {
    localStorage.setItem(LAST_ROUTE_KEY, pathname + search);
  } catch {
    // Storage blocked: the app simply opens on the overview next time.
  }
}

function readSaved() {
  try {
    return localStorage.getItem(LAST_ROUTE_KEY);
  } catch {
    return null;
  }
}

/** The path to open at launch: the saved screen when started from the home screen, else the URL as given. */
export function launchPath({ pathname, search, hash }: Pick<Location, "pathname" | "search" | "hash">) {
  const params = new URLSearchParams(search);
  if (params.get("source") !== "pwa") return null;

  const saved = readSaved();
  if (saved?.startsWith("/") && !saved.startsWith("//")) return saved;

  params.delete("source");
  const rest = params.toString();
  return pathname + (rest ? `?${rest}` : "") + hash;
}
