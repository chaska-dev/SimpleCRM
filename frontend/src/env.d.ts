/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    /** Request user (null = no session). Set by `meSSR` (lib/auth-server.ts). */
    user?: import("./types").User | null;
    /** Language, theme and accent resolved for the request. */
    prefs?: import("./lib/auth-server").Prefs;
  }
}
