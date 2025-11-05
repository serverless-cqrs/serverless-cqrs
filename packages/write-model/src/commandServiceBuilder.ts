/*
  Commands are the mechanism through which external applications
  add changes to our entities.

  The command service builder is takes two parameters:
  build({
    aggregateName, // string aggregate name
    actions, // an object containing action functions
    repository, // a repository that provides access to the data store
  })

  For each action name, the command service will generate a corresponding command.
  Each command accepts an id and a payload. 
  
  Each command loads the current state of the entity from the repo,
  and passes it and the payload to the action. The action will perform its
  validation and, if successfull, generate one or more events. The command
  forwards those events to the repository to be appended to the entity.
*/

import { ID, WriteModelRepository, Actions } from "@serverless-cqrs/types";

type Optional<Type, keys extends keyof Type> = Omit<Type, keys> &
  Partial<Pick<Type, keys>>;

type CommandHandlers<ActionsShape extends Actions> = {
  [Property in keyof ActionsShape]: (
    id: ID,
    metadata: Omit<
      Optional<Parameters<ActionsShape[Property]>[1], "at">,
      "aggregateId" | "aggregateName"
    >,
    ...rest: ActionsShape[Property] extends (
      state: any,
      metadata: any,
      ...rest: infer Args
    ) => any
      ? Args
      : never
  ) => Promise<void>;
};

export function build<
  AggregateShape,
  EventShape,
  ActionsShape extends Actions
>({
  aggregateName,
  actions,
  repository,
}: {
  aggregateName: String;
  actions: ActionsShape;
  repository: WriteModelRepository<AggregateShape, EventShape>;
}): CommandHandlers<ActionsShape> {
  const obj = {} as CommandHandlers<ActionsShape>;

  for (const key in actions) {
    const action = actions[key];
    obj[key] = async (id, metadata, ...args) => {
      const { state, save } = await repository.getById(id);
      let events = await action(
        state,
        {
          at: Date.now(),
          ...metadata,
          aggregateName,
          aggregateId: id,
        },
        ...args
      );

      if (!Array.isArray(events)) events = [events];
      await save(events);
    };
  }

  return obj;
}
