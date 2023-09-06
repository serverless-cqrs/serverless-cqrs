import got from "got";
import * as aws4 from "aws4";

import { fromNodeProviderChain } from "@aws-sdk/credential-providers";

// Name of the header used for X-ray tracing
const XRAY_TRACE_HEADER = "x-amzn-trace-id";

interface Params {
  endpoint: string;
  path?: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  body?: string;
}

const provider = fromNodeProviderChain();

interface Options extends got.GotJSONOptions {
  url: URL;
}
const awsClient = got.extend({
  hooks: {
    beforeRequest: [
      async (options) => {
        if ((options as any).isStream) {
          // Don't touch streams
          return;
        }

        // Make sure the credentials are resolved
        const credentials = await provider();
        console.log(credentials);
        const { url, headers, json } = options as Options;
        // Extract the Amazon trace id from the headers as it shouldn't be used for signing
        const { [XRAY_TRACE_HEADER]: amazonTraceId, ...signingHeaders } =
          headers!;

        // Map the request to something that is signable by aws4
        const request = {
          protocol: url.protocol,
          host: url.host,
          method: options.method,
          path: url.pathname + url.search,
          headers: signingHeaders,
          body: json ? JSON.stringify(json) : options.body?.toString(),
        };

        aws4.sign(request, credentials);

        options.headers = {
          ...request.headers,
          // Put back the trace id if we have one
          ...(amazonTraceId ? { [XRAY_TRACE_HEADER]: amazonTraceId } : {}),
        };
      },
    ],
  },
});

export default async ({ endpoint, path, body, method }: Params) => {
  return await awsClient("https://" + endpoint + path, {
    body,
    method,
    headers: {
      "Content-Type": "application/json",
    },
  });
};
