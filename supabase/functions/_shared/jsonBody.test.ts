import { assertEquals } from "jsr:@std/assert@1";
import { parseJsonObject, readJsonObject, toJsonObject } from "./jsonBody.ts";

// Regression: bug 2b. A body of `null` parsed fine, then the first field read
// threw, so /context (and /install, and product-event) crashed with a 500.
Deno.test("non-object JSON bodies become an empty object", () => {
  for (const text of ["null", "[]", "[1,2]", "5", '"x"', "true"]) {
    assertEquals(parseJsonObject(text), {}, text);
  }
});

Deno.test("broken JSON becomes an empty object", () => {
  for (const text of ["", "{", "{public_id:1}", "nul"]) {
    assertEquals(parseJsonObject(text), {}, text);
  }
});

Deno.test("a real object is returned as-is", () => {
  assertEquals(parseJsonObject('{"public_id":"abc","ch":"r"}'), {
    public_id: "abc",
    ch: "r",
  });
  assertEquals(parseJsonObject("{}"), {});
});

Deno.test("toJsonObject handles already-parsed values", () => {
  for (const value of [null, undefined, [], 5, "x", true]) {
    assertEquals(toJsonObject(value), {});
  }
  const obj = { a: 1 };
  assertEquals(toJsonObject(obj), obj);
});

Deno.test("readJsonObject reads a Request body", async () => {
  const post = (body: string) => new Request("http://x/context", { method: "POST", body });
  assertEquals(await readJsonObject(post("null")), {});
  assertEquals(await readJsonObject(post("[]")), {});
  assertEquals(await readJsonObject(post("{")), {});
  assertEquals(await readJsonObject(post('{"public_id":"abc"}')), { public_id: "abc" });
  assertEquals(await readJsonObject(new Request("http://x/context", { method: "POST" })), {});
});
