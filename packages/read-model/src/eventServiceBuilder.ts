/*
  An event handler forwards new events to the repository to be added to a projection  
*/

import { ReadModelRepository, EventService } from "@serverless-cqrs/types";

export function build<AggregateShape, EventShape>({
  repository,
}: {
  repository: ReadModelRepository<AggregateShape, EventShape>;
}): EventService<EventShape> {
  return {
    handleEvent: async ({ id, events, version }) => {
      await repository.applyEvents(id, events, version);
    },
  };
}
