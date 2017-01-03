import { expect } from "chai";
import _ = require("lodash");
import "mocha";

import { ITaskCompletion, ProgressTracker, TaskQueue } from "../src/queue";

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

    it("should allow finishing all tasks without problems", () => {
        const tasks = ["a:1", "b:2", "c:3", "d:4", "a:5", "a:6"];
        for (let task of tasks) {
            queue.add(task);
        }
        const completeOrder = tasks.slice(0, 3).reverse().concat(tasks.slice(3));
        for (let task of completeOrder) {
            expect(queue.tracker.running.length).to.be.greaterThan(0);
            queue.markTaskComplete(task);
        }
        expect(queue.tracker.complete).to.have.lengthOf(tasks.length);
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

    it("should call onDrain when running an empty queue", (done) => {
        queue = new TestQueue(1, 1);
        queue.onDrain = done;
        queue.run();
    });

    it("should call onDrain when all tasks are completed", (done) => {
        queue = new TestQueue(1, 1);
        queue.onDrain = (error?: Error) => {
            expect(error).to.be.undefined;
            expect(queue.tracker.numTasksCompleted).to.eql(3);
            done();
        };

        queue.addAll(["a:1", "a:2", "a:3"]);
        queue.run();

        queue.markTaskComplete("a:1");
        queue.markTaskComplete("a:2");
        queue.markTaskComplete("a:3");
    });

    it("should call onDrain once when a task finishes with an error", (done) => {
        const testError = new Error("foobar");

        queue = new TestQueue(1, 1);
        queue.onDrain = (error?: Error) => {
            expect(error).to.eql(testError);
            expect(queue.tracker.numTasksCompleted).to.eql(2);
            expect(queue.tracker.enqueued).to.have.lengthOf(1);
            done();
        };

        queue.addAll(["a:1", "a:2", "a:3"]);
        queue.run();

        queue.markTaskComplete("a:1");
        queue.markTaskComplete("a:2", testError);
    });
});
