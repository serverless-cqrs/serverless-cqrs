// checkpoint values with a special meaning. Neither can collide with a real commitId,
// since cuids are lowercase alphanumeric and start with "c".

// the start of the stream: a refresh from here replays every commit. Written by a
// rebuild of an empty event store, so refreshes know the store is ready and caught up.
// It's also what the event stores' listCommits defaults to, so older code reading it
// does the right thing.
export const START_OF_STREAM = "0";

// a rebuild with reset is in progress, so the projections are incomplete and refreshes
// pause until finalizeRebuild replaces it. "~" sorts after every commitId, so code that
// doesn't know about the marker lists no commits instead of replaying the whole stream.
export const REBUILDING = "~rebuilding";
