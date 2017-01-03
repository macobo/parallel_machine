export type TaskExecutor<T> = (task: T, callback: (Error?: any) => void) => void;
export type TaskDescriptor<T> = (task: T) => string;

export const REACHED_PARALLELISM_LIMIT = "parallelism_limit";
export type REACHED_PARALLELISM_LIMIT = "parallelism_limit";

export const QUEUE_DRAINED = "queue_drained";
export type QUEUE_DRAINED = "queue_drained";
