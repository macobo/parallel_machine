import _ from 'lodash';

interface TaskCompletion<T> {
    task: T;
}

type TaskExecutor<T> = (task: T, callback: (Error, any?) => void) => void;

class ProgressTracker<T> {
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

    completeTask(result: TaskCompletion<T>) {
        this.numRunningTasks -= 1
        this.numTasksCompleted += 1
    }
}

class TaskQueue<TaskType> {
    static NO_LIMIT = null;

    taskToKey: (task: TaskType) => string;
    executor: TaskExecutor<TaskType>;
    keyParallelism: number;
    overallParallelism: number;
    tracker: ProgressTracker<TaskType>;
    isStarted: boolean;

    private enqueuedTasks: {[key: string]: Array<TaskType>};
    private runningCount: {[key: string]: number};
    private availableKeys: Set<string>;

    constructor(
        taskToKey: (task: TaskType) => string,
        executor: TaskExecutor<TaskType>,
        keyParallelism: number,
        overallParallelism: number | null = TaskQueue.NO_LIMIT,
        progressTracker: ProgressTracker<TaskType> = new ProgressTracker()
    ) {
        this.taskToKey = taskToKey;
        this.executor = executor;
        this.keyParallelism = keyParallelism;
        this.overallParallelism = overallParallelism;
        this.tracker = progressTracker;

        this.isStarted = false;
        this.enqueuedTasks = {};
        this.availableKeys = new Set();
    }

    add(task: TaskType): void {
        const key: string = this.taskToKey(task);
        this.tracker.enqueueTask(task);

        if (!_.has(this.enqueuedTasks, key)) {
            this.enqueuedTasks[key] = [];
            this.availableKeys.add(key)
        }
        this.enqueuedTasks[key].push(task);
        if (this.isStarted)
            this.startAvailableTasks();
    }

    private dequeue(): {task: TaskType, key: string} | null {
        if (this.tracker.numRunningTasks >= this.overallParallelism) {
            return null;
        }
        // No keys have enough parallelism.
        if (this.availableKeys.size == 0) {
            return null;
        }
        const key: string = this.availableKeys.values().next().value;
        const task: TaskType = this.enqueuedTasks[key].pop();
        return {task: task, key: key};
    }

    private startAsyncTask(key: string, task: TaskType) {
        this.tracker.startTask(task);
        this.runningCount[key] += 1;
        if (this.keyParallelism > 0 && this.runningCount[key] >= this.keyParallelism) {
            this.availableKeys.delete(key);
        }

        this.executor(task, (error) => {
            this.taskComplete(key, task, error);
        });
    }

    private taskComplete(key: string, task: TaskType, error: Error) {
        const result: TaskCompletion<TaskType> = { task: task };

        this.runningCount[key] -= 1;
        if (!this.availableKeys.has(key) && this.keyParallelism > 0 && this.runningCount[key] >= this.keyParallelism) {
            this.availableKeys.add(key);
        }
        this.tracker.completeTask(result);

        // :TODO: check task depletion here.
    }

    private startAvailableTasks() {
        while (true) {
            const task = this.dequeue();
            if (task == null) break;
            this.startAsyncTask(task.key, task.task);
        }
    }

    run(): void {
        this.isStarted = true;
        this.startAvailableTasks();
    }
}

