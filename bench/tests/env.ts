import { fileURLToPath } from "node:url";

export const PORT = 4173;

/** Fixtures pretend to live on several sites; Chromium resolves all *.test hosts to the local fixture server. */
export const BASE = `http://news.test:${PORT}`;
export const HOST_RULES = "--host-resolver-rules=MAP *.test 127.0.0.1";

export const EXTENSION_PATH = fileURLToPath(new URL("../../extension/dist", import.meta.url));
