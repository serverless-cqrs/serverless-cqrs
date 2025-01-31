import { test } from "tap";
import nock from "nock";
import makeSignedRequest from "../makeSignedRequest.ts";
test("make signed request", async (t) => {
  nock("https://foo.bar").post("/baz").reply(200, { hello: "world" });

  const res = await makeSignedRequest({
    endpoint: "foo.bar",
    path: "baz",
    body: "foobar",
    method: "POST",
  });

  t.equal(res.statusCode, 200);
});
