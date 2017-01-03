import { Set } from "core-js/library";
import _ = require("lodash");

export interface ITaskCompletion<T> {
    task: T;
}

type TaskExecutor<T> = (task: T, callback: (Error?: any) => void) => void;

const REACHED_PARALLELISM_LIMIT = "parallelism_limit";
type REACHED_PARALLELISM_LIMIT = "parallelism_limit";

const QUEUE_DRAINED = "queue_drained";
type QUEUE_DRAINED = "queue_drained";

export class ProgressTracker<T> {
    numTotalTasks: number;
    numEnqueuedTasks: number;
    numTasksCompleted: number;
    numRunningTasks: number;

    constructor() {
        this.numTotalTasks = 0;
        this.numEnqueuedTasks = 0;
        this.numTasksCompleted = 0;
        this.numRunningTasks = 0;
    }

    enqueueTask(task: T) {
        this.numTotalTasks += 1;
        this.numEnqueuedTasks += 1;
    }

    startTask(task: T) {
        this.numRunningTasks += 1;
        this.numEnqueuedTasks -= 1;
    }

    completeTask(result: ITaskCompletion<T>) {
        this.numRunningTasks -= 1;
        this.numTasksCompleted += 1;
    }
}

export abstract class TaskQueue<TaskType> {
    static NO_LIMIT = null;

    taskToKey: (task: TaskType) => string;
    keyParallelism: number;
    overallParallelism: number | null;
    tracker: ProgressTracker<TaskType>;
    isStarted: boolean;

    private enqueuedTasks: {[key: string]: TaskType[]};
    private runningCount: {[key: string]: number};
    private availableKeys: Set<string>;

    constructor(
        taskToKey: (task: TaskType) => string,
        keyParallelism: number,
        overallParallelism: number | null = TaskQueue.NO_LIMIT,
        progressTracker: ProgressTracker<TaskType> = new ProgressTracker(),
    ) {
        this.taskToKey = taskToKey;
        this.keyParallelism = keyParallelism;
        this.overallParallelism = overallParallelism;
        this.tracker = progressTracker;

        this.isStarted = false;
        this.enqueuedTasks = {};
        this.availableKeys = new Set<string>();
    }

    abstract executeTask(key: string, task: TaskType): void

    add(task: TaskType): void {
        const key: string = this.taskToKey(task);
        this.tracker.enqueueTask(task);

        if (!_.has(this.enqueuedTasks, key)) {
            this.enqueuedTasks[key] = [];
            this.availableKeys.add(key);
        }
        this.enqueuedTasks[key].push(task);
        if (this.isStarted)
            this.startAvailableTasks();
    }

    protected dequeue(): {task: TaskType, key: string} | QUEUE_DRAINED | REACHED_PARALLELISM_LIMIT {
        if (this.tracker.numRunningTasks >= this.overallParallelism) {
            return REACHED_PARALLELISM_LIMIT;
        }
        // No keys have enough parallelism.
        if (this.availableKeys.size === 0) {
            return REACHED_PARALLELISM_LIMIT;
        }
        const keys = this.availableKeys.values();
        const nextKeyIter: IteratorResult<string> = this.availableKeys.values().next();
        if (nextKeyIter.done)
            return QUEUE_DRAINED;

        const key: string = <string>(nextKeyIter.value);
        const task: TaskType | undefined = this.enqueuedTasks[key].pop();
        if (task === undefined) {
            // If we have done all tasks for this key, it"s safe to delete it and attempt to dequeue again.
            this.availableKeys.delete(key);
            return this.dequeue();
        }
        return {task, key};
    }

    protected startTask(key: string, task: TaskType): void {
        this.tracker.startTask(task);
        this.runningCount[key] += 1;
        if (this.keyParallelism > 0 && this.runningCount[key] >= this.keyParallelism) {
            this.availableKeys.delete(key);
        }
    }

    markTaskComplete(key: string, task: TaskType, error: Error): void {
        const result: ITaskCompletion<TaskType> = { task };

        this.runningCount[key] -= 1;
        if (!this.availableKeys.has(key) && this.keyParallelism > 0 && this.runningCount[key] >= this.keyParallelism) {
            this.availableKeys.add(key);
        }
        this.tracker.completeTask(result);
        this.startAvailableTasks();

        // this.checkTaskDepletion();
    }

    protected startAvailableTasks(): void {
        while (true) {
            const taskResult = this.dequeue();
            if (taskResult === REACHED_PARALLELISM_LIMIT || taskResult === QUEUE_DRAINED)
                break;
            this.startTask(taskResult.key, taskResult.task);
        }
    }

    run(): void {
        this.isStarted = true;
        this.startAvailableTasks();
        // this.checkTaskDepletion();
    }
}

class AsyncTaskQueue<TaskType> extends TaskQueue<TaskType> {
    executor: TaskExecutor<TaskType>;

    constructor(
        taskToKey: (task: TaskType) => string,
        executor: TaskExecutor<TaskType>,
        keyParallelism: number,
        overallParallelism: number | null = TaskQueue.NO_LIMIT,
        progressTracker: ProgressTracker<TaskType> = new ProgressTracker(),
    ) {
        super(taskToKey, keyParallelism, overallParallelism, progressTracker);
        this.executor = executor;
    }

    executeTask(key: string, task: TaskType): void {
        this.executor(task, (error) => {
            this.markTaskComplete(key, task, error);
        });
    }
}
