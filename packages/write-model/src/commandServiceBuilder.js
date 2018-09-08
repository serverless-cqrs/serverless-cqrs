/*
  Commands are the mechanism through which external applications
  add changes to our entities.

  The command service builder is takes two parameters:
  build({
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


const mapValues = object => func => {
  return Object.keys(object).reduce((p, c) => ({
    ...p,
    [ c ]: func(object[c])
  }))
}

module.exports.build = ({ actions, repository }) => {
  return mapValues(actions, action => {
    return async (id, args) => {
      const { state, save } = await repository.getById(id)

      // here is a way to allow command services to augment the default built
      // command. By providing a function, they are given the current state
      // and can dynamically modify the contents of the payload depending
      // for example, to load additional resources.
      const payload = typeof args === 'function'
        ? await args(state)
        : args

      const event = action(state, payload)
      await save(event)
      return true
    }
  })
}