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
        this.enqueued = _.without(this.enqueued, task);
    }

    completeTask(result: ITaskCompletion<string>) {
        super.completeTask(result);
        expect(this.running).to.contain(result.task);
        this.complete.push(result);
        this.running = _.without(this.running, result.task);
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

    it("should keep a queue for tasks that were over `keyParallelism`", () => {
        queue.add("a:1");
        queue.add("a:2");
        queue.add("a:3");
        queue.add("a:4");

        expect(queue.tracker.running).to.eql(["a:1", "a:2"]);
        expect(queue.tracker.enqueued).to.eql(["a:3", "a:4"]);
    });

    it("should keep up to `overallParallelism` tasks running", () => {
        for (let letter of "abc") {
            for (let index of [1, 2, 3]) {
                queue.add(`${letter}:${index}`);
            }
        }

        expect(queue.tracker.running).to.eql(["a:1", "a:2", "b:1", "b:2"]);
        expect(queue.tracker.enqueued).to.have.lengthOf(5);
    });

    it("should start an enqueued task when another task finishes", () => {
        queue.add("a:1");
        queue.add("a:2");
        queue.add("a:3");

        expect(queue.tracker.running).to.eql(["a:1", "a:2"]);
        queue.markTaskComplete("a:1");

        expect(queue.tracker.running).to.eql(["a:2", "a:3"]);
    });

    it("should respect `NO_LIMIT` `overallParallelism`", () => {
        queue = new TestQueue(1, TaskQueue.NO_LIMIT);
        queue.run();

        for (let letter of "abcdefghijklmnopqrst") {
            queue.add(`${letter}:${letter}`);
        }

        expect(queue.tracker.enqueued).to.have.lengthOf(0);
        expect(queue.tracker.running).to.have.lengthOf(20);
    });
});
