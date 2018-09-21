The goal of this project is to create a simple and easy-to-understand framework for building CQRS/ES services and deploying them to a serverless infrastructure.

The library is structured around the principles of Onion Architecture so that it’s parts are easily testable and can be swapped out to support a variety of data storage options. It comes bundled with support for DynamoDB as the event store and AWS Elasticsearch service as the read projection store.

This project combines concepts from [CQRS](http://www.cqrs.nu/Faq/command-query-responsibility-segregation), [Event Sourcing](http://www.cqrs.nu/Faq/event-sourcing), [DDD](http://www.cqrs.nu/Faq/domain-driven-design), and [Onion Architecture](https://www.codeguru.com/csharp/csharp/cs_misc/designtechniques/understanding-onion-architecture.html). Much of the inspiration for structuring it this way came from [this blog post](https://medium.com/@domagojk/patterns-for-designing-flexible-architecture-in-node-js-cqrs-es-onion-7eb10bbefe17). Here are some definitions of terms used throughout the project (if I’m using the wrong term for any of these, please let me know :)

- **Entities**: the objects you are working with. I.e a User or a Post
- **Projection**: The state of an entity, derived from a stream of events
- **Domain**: The core business logic of your application, described as a series of pure functions. They never mutate data and have zero dependencies. There are two types of domain functions:
    - **Actions**: Given only the current state of an entity and some input, decide if an action should be allowed. If no, throw an error. If yes, return a new event, representing the completion of that action
    - **Reducers**: Given only the current state and a new event, compute and return the new state.
- **Repository**: A layer that knows how to read and write to some data storage. It implements a standard interface for retrieving existing events/projections and writing new ones. 
- **Services**: These are the interfaces you call to work with your data. There are a few kinds of services:
    - **Commands**: you call this service to perform actions on your data. It loads the existing state from the repo and passes it to the domain. If your action is approved, a new event is generated and saved to the repo. Commands have no return value.
    - **Query**: Methods for retrieving the current state(s) of entities
    - **Events**: Listens for new events as they are saved to the the datastore. As events arrive, update the stored projections.
    - **Refresh**: Loads past events and applies them to projections (if not yet applied). Useful for rebuilding your projections when something changes

Further reading:
https://medium.com/@teivah/1-year-of-event-sourcing-and-cqrs-fb9033ccd1c6
