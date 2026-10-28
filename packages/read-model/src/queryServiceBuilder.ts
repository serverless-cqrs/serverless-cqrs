import { ReadModelRepository, QueryService } from "@serverless-cqrs/types";

// Only a query that asks for a consistent read gets the primary. Any other may be answered by a
// replica, which is a moment behind; reads that haven't refreshed the read model first are
// already that far behind the event store anyway. The store defaults the other way, to the
// primary, for the read model's own upkeep, so the default has to be spelled out here.
export function build<ProjectionShape, EventShape>({
  repository,
}: {
  repository: ReadModelRepository<ProjectionShape, EventShape>;
}): QueryService<ProjectionShape> {
  return {
    getById: async ({ id, consistentRead }) => {
      const result = await repository.getById(id, { consistentRead: consistentRead === true });
      if (result) return { id, ...result.state };
    },
    getByIds: async ({ ids, consistentRead }) => {
      const results = await repository.getByIds(ids, { consistentRead: consistentRead === true });
      return results.map((e) => ({ id: e.id, ...e.state }));
    },
    search: async (params) => {
      const { data, total } = await repository.search({
        ...params,
        consistentRead: params?.consistentRead === true,
      });

      return {
        total,
        data: data.map((e) => ({ id: e.id, ...e.state })),
      };
    },
  };
}
