/**
 * Engine (page's MAIN world) -> extension (ISOLATED world) channel.
 *
 * Both scripts run at document_start, before any page script. The isolated
 * side generates a random secret and hands it over in a synchronous
 * CustomEvent handshake; after that, messages travel only on an event named
 * by the secret, so a page that starts listening later can't see or forge
 * them. Whichever script runs second completes the handshake.
 */
import type { NullifyEvent } from "@nullifyads/core";

/** Dispatched by the engine when it starts, in case the isolated script ran first. */
export const MAIN_HELLO = "nullify:main-hello";
/** Dispatched by the isolated script, carrying the secret channel name. */
export const ISOLATED_HELLO = "nullify:isolated-hello";

export type ChannelMessage =
  | { type: "ack" }
  | { type: "event"; event: NullifyEvent }
  | { type: "popup-allowed" };

/** What the isolated script forwards to the service worker. */
export type RuntimeMessage =
  | { type: "event"; event: NullifyEvent }
  | { type: "popup-allowed" }
  | { type: "set-site-enabled"; site: string; enabled: boolean };

export const MIN_SECRET_LENGTH = 32;
