import { ReadModelRepository, QueryService } from "@serverless-cqrs/types";

export function build<AggregateShape, EventShape>({
  repository,
}: {
  repository: ReadModelRepository<AggregateShape, EventShape>;
}): QueryService<AggregateShape> {
  return {
    getById: async ({ id }) => {
      const { state } = await repository.getById(id);
      if (state) return { id, ...state };
    },
    getByIds: async ({ ids }) => {
      const { results } = await repository.getByIds(ids);
      return results.map((e) => ({ id: e.id, ...e.state }));
    },
    search: async (params) => {
      const { data, total } = await repository.search(params);
      return {
        total,
        results: data.map((e) => ({ id: e.id, ...e.state })),
      };
    },
  };
}
