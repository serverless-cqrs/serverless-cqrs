module.exports.build = ({ entityName }, { userPoolId }) => {

  const parseCommit = event => {
    if (event.userPoolId !== userPoolId) return

    return {
      id: event.userName,
      entity: entityName,
      events: [{
        type: event.triggerSource,
        user: {
          userName: event.userName,
        },
        payload: event.request,
      }],
    }
  }

  return {
    parseCommit,
  }
}
