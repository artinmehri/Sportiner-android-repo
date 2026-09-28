import { assertEquals } from "jsr:@std/assert@1";
import { deviceContext } from "./deviceContext.ts";

Deno.test("valid snake_case fields pass through normalized", () => {
  assertEquals(
    deviceContext({
      device_type: " Mobile ",
      connection_type: "4G",
      screen_resolution: "390X844",
      device_language: "en-US",
    }),
    {
      device_type: "mobile",
      connection_type: "4g",
      screen_resolution: "390x844",
      device_language: "en-US",
    },
  );
});

Deno.test("camelCase aliases are accepted", () => {
  assertEquals(
    deviceContext({
      deviceType: "tablet",
      connectionType: "slow-2g",
      screenResolution: "1024x768",
      deviceLanguage: "fr",
    }),
    {
      device_type: "tablet",
      connection_type: "slow-2g",
      screen_resolution: "1024x768",
      device_language: "fr",
    },
  );
});

Deno.test("snake_case wins over camelCase when both are sent", () => {
  assertEquals(deviceContext({ device_type: "desktop", deviceType: "mobile" }), {
    device_type: "desktop",
  });
});

Deno.test("values outside the vocabularies are dropped, not failed", () => {
  assertEquals(
    deviceContext({
      device_type: "phone",
      connection_type: "wifi",
      screen_resolution: "big",
      device_language: "en_US!",
    }),
    {},
  );
});

Deno.test("length caps apply before validation", () => {
  // A resolution over 16 chars is cut and then fails the pattern.
  assertEquals(deviceContext({ screen_resolution: "12345x12345" + "0".repeat(20) }), {});
  // A language over 35 chars is cut; the cut value is still checked.
  assertEquals(deviceContext({ device_language: "en-" + "a".repeat(60) }), {});
});

Deno.test("non-string and empty values are ignored", () => {
  assertEquals(
    deviceContext({
      device_type: 5,
      connection_type: null,
      screen_resolution: "",
      device_language: [],
    }),
    {},
  );
  assertEquals(deviceContext({}), {});
});
