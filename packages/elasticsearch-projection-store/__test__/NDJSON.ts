import { test } from "tap";
import { stringify } from "../NDJSON.js";

test("stringify", (assert) => {
  const expected = '{"foo":"bar"}\n{"bar":"baz"}\n';
  const params = [{ foo: "bar" }, { bar: "baz" }];
  const res = stringify(params);
  assert.plan(1);
  assert.same(res, expected, "stringifies");
});
