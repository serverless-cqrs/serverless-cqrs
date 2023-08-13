import { ReadModelRepository, QueryService } from "@serverless-cqrs/types";

export function build<ProjectionShape, EventShape>({
  repository,
}: {
  repository: ReadModelRepository<ProjectionShape, EventShape>;
}): QueryService<ProjectionShape> {
  return {
    getById: async ({ id }) => {
      const result = await repository.getById(id);
      if (result) return { id, ...result.state };
    },
    getByIds: async ({ ids }) => {
      const results = await repository.getByIds(ids);
      return results.map((e) => ({ id: e.id, ...e.state }));
    },
    search: async (params) => {
      const { data, total } = await repository.search(params);
      const results = data.map((e) => ({ id: e.id, ...e.state }));

      return {
        total,
        results,
      };
    },
  };
}
