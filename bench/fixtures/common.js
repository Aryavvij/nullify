// Shared helpers for fixtures. Every "other site" maps to the same local server
// via Chromium's --host-resolver-rules, so nothing ever leaves the machine.
// ?dest=known sends the trap to real pop-under ad network names that filter lists know
// (still resolved to this machine by --host-resolver-rules); the default is made-up
// *.test names no list knows, like a new or rotated ad domain.
const known = new URLSearchParams(location.search).get("dest") === "known";
window.FIX = {
  url: (host, path = "/landing.html") => `http://${host}:${location.port}${path}`,
  ad: (tag) => FIX.url(known ? "popads.net" : "ads.test", `/landing.html?from=${tag}`),
  scam: (tag) => FIX.url(known ? "popcash.net" : "scam.test", `/landing.html?from=${tag}`),
  mode: () => new URLSearchParams(location.search).get("mode"),
};
