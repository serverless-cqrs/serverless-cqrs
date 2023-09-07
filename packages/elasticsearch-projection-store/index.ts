import { default as pluralize } from "pluralize";
import makeSignedRequest, { HTTPError } from "./makeSignedRequest";
import {
  ProjectionSearchParams,
  ProjectionStore,
  VersionLock,
} from "@serverless-cqrs/types";
const camelToSnakeCase = (str: string) =>
  str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
import * as NDJSON from "./NDJSON";

const parseResult = <AggregateShape>({
  _id,
  _version = 0,
  _source,
}: {
  _id: string;
  _version: number;
  _source: AggregateShape;
}) => ({
  id: _id,
  version: _version,
  state: _source,
});

export interface ElasticSearchConfig {
  endpoint: string;
}

interface BuildParams {
  entityName: string;
}

const parseJson = (text: any) => {
  try {
    return JSON.parse(text);
  } catch (e) {
    return text;
  }
};

const buildPath = (...args: string[]) => "/" + args.join("/");

export function build<AggregateShape>(
  { entityName }: BuildParams,
  { endpoint }: ElasticSearchConfig
): ProjectionStore<AggregateShape> {
  const sanitizedEntity = camelToSnakeCase(entityName);
  const index = pluralize(sanitizedEntity);
  const type = sanitizedEntity;

  const _parseResult = parseResult<AggregateShape>;

  const defaults: {
    endpoint: string;
    method: "GET";
  } = {
    endpoint,
    method: "GET",
  };

  const buildQueryFromSearchParams = (
    params: ProjectionSearchParams<AggregateShape>
  ) => {
    if (params.rawSearch) return params.rawSearch;

    const query: Record<string, any> = {};

    if (params.pagination) {
      const { page, perPage } = params.pagination;
      query.from = (page - 1) * perPage;
      query.size = perPage;
    }

    if (params.sort) {
      let { field, order } = params.sort;
      if (field == "id") field = "_id";
      query.sort = [{ [field]: order }];
    }

    if (params.rawQuery) {
      query.query = params.rawQuery;
    } else if (params.filter && Object.keys(params.filter).length > 0) {
      const filter = params.filter as Record<string, any>;

      query.query = {
        bool: {
          must: Object.keys(filter).map((key) => ({
            match: {
              [key]: filter[key],
            },
          })),
        },
      };
    }

    return query;
  };

  return {
    set: async ({ id, version, state }) => {
      const { body } = await makeSignedRequest({
        ...defaults,
        method: state ? "PUT" : "DELETE",
        path: buildPath(
          index,
          type,
          encodeURIComponent(id) +
            "?refresh=wait_for&version_type=external&version=" +
            version
        ),
        body: JSON.stringify(state),
      });

      return parseJson(body);
    },
    get: async (id) => {
      try {
        const { body } = await makeSignedRequest({
          ...defaults,
          path: buildPath(index, type, encodeURIComponent(id)),
        });
        const data = parseJson(body);
        return _parseResult(data);
      } catch (e) {
        if (e instanceof HTTPError && e.response.statusCode == 404) return;
        throw e;
      }
    },

    setVersionLock: async ({ version, lastCommitId }: VersionLock) => {
      const { body } = await makeSignedRequest({
        ...defaults,
        method: "PUT",
        path: buildPath(index, "_mapping"),
        body: JSON.stringify({
          _meta: {
            version,
            lastCommitId,
          },
        }),
      });

      return parseJson(body);
    },
    getVersionLock: async () => {
      try {
        const { body } = await makeSignedRequest({
          ...defaults,
          path: buildPath(index, "_mapping"),
        });
        const data = parseJson(body);
        return data[index] && data[index]["mappings"]["_meta"];
      } catch (e) {
        if (e instanceof HTTPError && e.response.statusCode == 404) return;
        throw e;
      }
    },
    batchGet: async (ids) => {
      const { body } = await makeSignedRequest({
        ...defaults,
        method: "POST",
        path: buildPath(index, type, "_mget"),
        body: JSON.stringify({ ids }),
      });

      const data = parseJson(body);
      const found = data.docs.filter((r: any) => r.found);
      return found.map(_parseResult);
    },
    batchWrite: async (obj) => {
      const content = Object.keys(obj).reduce((p, id) => {
        const { version, state } = obj[id];
        if (!state)
          return [
            ...p,
            {
              delete: {
                _id: id,
              },
            },
          ];

        return [
          ...p,
          {
            index: {
              _id: id,
              version: version,
              version_type: "external",
            },
          },
          state,
        ];
      }, [] as any[]);

      if (content.length == 0) return {};

      const { body } = await makeSignedRequest({
        ...defaults,
        method: "POST",
        path: buildPath(index, type, "_bulk?refresh=wait_for"),
        body: NDJSON.stringify(content),
      });

      const data = parseJson(body);

      return data.items.reduce((p: Record<string, any>, c: any) => {
        const { _id, error } = c.index || c.delete;
        if (!error) return p;

        return {
          ...p,
          [_id]: error,
        };
      }, {});
    },
    search: async (searchParams) => {
      const query = buildQueryFromSearchParams(searchParams);
      try {
        const { body } = await makeSignedRequest({
          ...defaults,
          method: "POST",
          path: buildPath(index, type, "_search"),
          body: JSON.stringify({
            version: true,
            ...query,
          }),
        });

        const data = parseJson(body);

        const { total, hits } = data.hits;

        return {
          total: total.value,
          data: hits.map(_parseResult),
        };
      } catch (e) {
        console.log(e);
        if (e instanceof HTTPError && e.response.statusCode == 404)
          return {
            total: 0,
            data: [],
          };

        throw e;
      }
    },
  };
}
