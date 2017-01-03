import { ProgressTracker } from "./queue";

export type TaskExecutor<T> = (task: T, callback: (Error?: any) => void) => void;
export type TaskDescriptor<T> = (task: T) => string;

export const REACHED_PARALLELISM_LIMIT = "parallelism_limit";
export type REACHED_PARALLELISM_LIMIT = "parallelism_limit";

export const QUEUE_DRAINED = "queue_drained";
export type QUEUE_DRAINED = "queue_drained";

export interface IParallelMachineOptions<T> {
    // Function which for each task returns it's key (i.e. hostname)
    taskDescriptor: TaskDescriptor<T>;
    // Async function that executes an action on the target task, calling back once done.
    executor: TaskExecutor<T>;
    // Up to how many tasks for a given `key` to execute at a time.
    keyParallelism: number;
    // How many tasks to execute overall. Null or missing means unlimited.
    overallParallelism?: number | null;
    progressTracker?: ProgressTracker<T>;
}
