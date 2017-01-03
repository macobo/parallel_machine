import { IParallelMachineOptions, TaskDescriptor, TaskExecutor } from "./common";
import { AsyncTaskQueue } from "./queue";

function parallel_machine<T>(
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
    queue.onDrain = callback;

    queue.run();
}

export = parallel_machine;
