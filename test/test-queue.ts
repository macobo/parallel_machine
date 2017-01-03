import { expect } from "chai";
import _ = require("lodash");
import "mocha";

import { ITaskCompletion, ProgressTracker, TaskQueue } from "../src";

class FullProgressTracker extends ProgressTracker<string> {
    enqueued: string[];
    running: string[];
    complete: Array<ITaskCompletion<string>>;

    constructor() {
        super();
        this.enqueued = [];
        this.running = [];
        this.complete = [];
    }

    enqueueTask(task: string) {
        super.enqueueTask(task);
        this.enqueued.push(task);
    }

    startTask(task: string) {
        super.startTask(task);
        expect(this.enqueued).to.contain(task);

        this.running.push(task);
        this.enqueued = _.remove(this.enqueued, task);
    }

    completeTask(result: ITaskCompletion<string>) {
        super.completeTask(result);
        expect(this.running).to.contain(result.task);
        this.complete.push(result);
        this.running = _.remove(this.running, result.task);
    }
}

class TestQueue extends TaskQueue<string> {
    tracker: FullProgressTracker;

    constructor(keyParallelism: number, overallParallelism: number | null) {
        super(
            (task: string) => task.split(":")[0],
            keyParallelism,
            overallParallelism,
            new FullProgressTracker(),
        );
    }

    /* tslint:disable:no-empty */
    executeTask(key: string, task: string): void {}
    /* tslint:enable:no-empty */
}

describe("TaskQueue<TaskType>", () => {
    let queue: TestQueue;

    beforeEach(() => {
        queue = new TestQueue(2, 4);
        queue.run();
    });

    it("should immediately start tasks that were enqueued", () => {
        queue.add("a:1");
        queue.add("a:2");

        expect(queue.tracker.enqueued).to.eql([]);
        expect(queue.tracker.running).to.eql(["a:1", "a:2"]);
    });
});
