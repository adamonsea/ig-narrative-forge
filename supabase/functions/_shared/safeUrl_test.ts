import { assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { isPublicHttpUrl, isPrivateIp } from "./safeUrl.ts";

Deno.test("private addresses are blocked", async () => {
  for (const u of ["http://localhost/", "http://127.0.0.1/", "http://10.1.2.3/", "http://172.16.0.1/", "http://172.31.9.9/",
    "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "http://metadata.google.internal/",
    "http://example.com:8080/", "ftp://example.com/"]) {
    assertEquals(await isPublicHttpUrl(u), false, u);
  }
});
Deno.test("public ip passes", () => {
  assertEquals(isPrivateIp("8.8.8.8"), false);
  assertEquals(isPrivateIp("172.32.0.1"), false);
});
