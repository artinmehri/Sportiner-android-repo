import { assert, assertEquals } from "jsr:@std/assert@1";
import { jsonForScript } from "./handoff.ts";

Deno.test("jsonForScript never lets a string close the script tag", () => {
  const out = jsonForScript("</script><script>alert(1)</script>&\u2028\u2029");
  assert(!out.includes("<") && !out.includes(">") && !out.includes("&"));
  assert(!out.includes("\u2028") && !out.includes("\u2029"));
  assertEquals(JSON.parse(out), "</script><script>alert(1)</script>&\u2028\u2029");
  assertEquals(jsonForScript(null), "null");
});
