import { Set } from "core-js/library";
import _ = require("lodash");

import { QUEUE_DRAINED, REACHED_PARALLELISM_LIMIT, TaskExecutor, TaskDescriptor } from "./common";

export interface ITaskCompletion<T> {
    task: T;
}

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

    taskToKey: TaskDescriptor<TaskType>;
    keyParallelism: number;
    overallParallelism: number | null;
    tracker: ProgressTracker<TaskType>;
    isStarted: boolean;
    isFinished: boolean;

    private enqueuedTasks: {[key: string]: TaskType[]};
    private runningCount: {[key: string]: number};
    private availableKeys: Set<string>;
    private drainCallback: (error?: Error) => void;

    constructor(
        taskToKey: TaskDescriptor<TaskType>,
        keyParallelism: number,
        overallParallelism: number | null = TaskQueue.NO_LIMIT,
        progressTracker: ProgressTracker<TaskType> = new ProgressTracker(),
    ) {
        this.taskToKey = taskToKey;
        this.keyParallelism = keyParallelism;
        this.overallParallelism = overallParallelism;
        this.tracker = progressTracker;

        this.isStarted = false;
        this.isFinished = false;
        this.runningCount = {};
        this.enqueuedTasks = {};
        this.availableKeys = new Set<string>();
        this.drainCallback = _.identity;
    }

    abstract executeTask(key: string, task: TaskType): void

    set onDrain(callback: (error?: Error) => void) {
        this.drainCallback = callback;
    }

    add(task: TaskType): void {
        const key: string = this.taskToKey(task);
        this.tracker.enqueueTask(task);

        if (!this.availableKeys.has(key) && this.canStartTaskForKey(key)) {
            this.availableKeys.add(key);
            // :TRICKY: The key might have been removed from available keys by a previous `taskStart`
            //    even while tasks were enqueued for it.
            this.enqueuedTasks[key] = this.enqueuedTasks[key] || [];
        }
        this.enqueuedTasks[key].push(task);
        if (this.isStarted)
            this.startAvailableTasks();
    }

    addAll(tasks: TaskType[]): void {
        for (let task of tasks)
            this.add(task);
    }

    markTaskComplete(task: TaskType, error?: Error): void {
        const key = this.taskToKey(task);

        const result: ITaskCompletion<TaskType> = { task };

        this.runningCount[key] -= 1;
        if (!this.availableKeys.has(key) && this.canStartTaskForKey(key)) {
            this.availableKeys.add(key);
        }
        this.tracker.completeTask(result);
        this.startAvailableTasks();

        this.checkTaskDepletion();
    }

    protected dequeue(): {task: TaskType, key: string} | QUEUE_DRAINED | REACHED_PARALLELISM_LIMIT {
        if (this.overallParallelism !== TaskQueue.NO_LIMIT && this.tracker.numRunningTasks >= this.overallParallelism) {
            return REACHED_PARALLELISM_LIMIT;
        }
        if (this.tracker.numEnqueuedTasks === 0) {
            return QUEUE_DRAINED;
        }
        // No keys have enough parallelism.
        if (this.availableKeys.size === 0) {
            return REACHED_PARALLELISM_LIMIT;
        }
        const keys = this.availableKeys.values();
        const nextKeyIter: IteratorResult<string> = this.availableKeys.values().next();
        if (nextKeyIter.done)
            return QUEUE_DRAINED;

        const key: string = <string> (nextKeyIter.value);
        const task: TaskType | undefined = this.enqueuedTasks[key].pop();
        if (task === undefined) {
            // If we have done all tasks for this key, it's safe to delete it and attempt to dequeue again.
            this.availableKeys.delete(key);
            return this.dequeue();
        }
        return {task, key};
    }

    protected startTask(key: string, task: TaskType): void {
        this.tracker.startTask(task);
        this.runningCount[key] = (this.runningCount[key] || 0) + 1;
        if (!this.canStartTaskForKey(key)) {
            this.availableKeys.delete(key);
        }
        this.executeTask(key, task);
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
        this.checkTaskDepletion();
    }

    private canStartTaskForKey(key: string): boolean {
      return (this.runningCount[key] || 0) < this.keyParallelism;
    }

    private checkTaskDepletion(): void {
        if (this.tracker.numTasksCompleted === this.tracker.numTotalTasks) {
            this.drainCallback();
        }
    }
}

export class AsyncTaskQueue<TaskType> extends TaskQueue<TaskType> {
    executor: TaskExecutor<TaskType>;

    constructor(
        taskToKey: TaskDescriptor<TaskType>,
        executor: TaskExecutor<TaskType>,
        keyParallelism: number,
        overallParallelism: number | null = TaskQueue.NO_LIMIT,
        progressTracker: ProgressTracker<TaskType> = new ProgressTracker(),
    ) {
        super(taskToKey, keyParallelism, overallParallelism, progressTracker);
        this.executor = executor;
    }

    executeTask(key: string, task: TaskType): void {
        this.executor(task, (error: Error | undefined) => {
            this.markTaskComplete(task, error);
        });
    }
}
