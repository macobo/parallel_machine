import { TaskDescriptor, TaskExecutor } from "./common";
import { AsyncTaskQueue, ProgressTracker, TaskQueue } from "./queue";

export interface IParallelMachineOptions<T> {
    // Function which for each task returns it's key (i.e. hostname)
    taskDescriptor: TaskDescriptor<T>;
    // Async function that executes an action on the target task, calling back once done.
    executor: TaskExecutor<T>;
    // Up to how many tasks for a given `key` to execute at a time.
    keyParallelism: number;
    // How many tasks to execute overall. Null means unlimited.
    overallParallelism?: number | null;
    progressTracker?: ProgressTracker<T>;
}

export function parallel_execute<T>(
    tasks: T[],
    options: IParallelMachineOptions<T>,
    callback: (error: Error) => void,
): void {
    const queue: AsyncTaskQueue<T> = new AsyncTaskQueue<T>(
        options.taskDescriptor,
        options.executor,
        options.keyParallelism,
        options.overallParallelism,
        options.progressTracker,
    );
    queue.addAll(tasks);
    // queue.onDrain = callback;

    queue.run();
}

export default parallel_execute;
