import { assert, assertEquals } from "jsr:@std/assert@1";
import { CHANNEL_RAW_MAX, sanitizeChannelRaw } from "./channelRaw.ts";

Deno.test("keeps lowercase letters, digits, dash and underscore", () => {
  assertEquals(sanitizeChannelRaw("tiktok"), "tiktok");
  assertEquals(sanitizeChannelRaw("Spring_2026-Promo"), "spring_2026-promo");
});

Deno.test("strips unsafe characters", () => {
  assertEquals(sanitizeChannelRaw(" tik tok!?&=/%20 "), "tiktok20");
  assertEquals(sanitizeChannelRaw("naïve"), "nave");
});

Deno.test("caps long input", () => {
  const out = sanitizeChannelRaw("a".repeat(5000));
  assertEquals(out, "a".repeat(CHANNEL_RAW_MAX));
  assertEquals(CHANNEL_RAW_MAX, 64);
});

Deno.test("empty after cleaning, or not a string, is null", () => {
  for (const value of ["", "   ", "!!!", "<>\"'", null, undefined, 5, {}, []]) {
    assertEquals(sanitizeChannelRaw(value), null);
  }
});

Deno.test("script and HTML injection attempts come out inert", () => {
  const attempts = [
    "</script><script>alert(1)</script>",
    '"><img src=x onerror=alert(1)>',
    "';alert(1);//",
    "javascript:alert(1)",
  ];
  for (const attempt of attempts) {
    const out = sanitizeChannelRaw(attempt) ?? "";
    assert(/^[a-z0-9_-]*$/.test(out), `unsafe output for ${attempt}: ${out}`);
  }
  assertEquals(
    sanitizeChannelRaw("</script><script>alert(1)</script>"),
    "scriptscriptalert1script",
  );
});
