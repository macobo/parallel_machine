import { expect } from "chai";
import _ = require("lodash");
import "mocha";

import parallel_machine from "../src";
import { TaskDescriptor, TaskExecutor } from "../src/common";

type Callback = (err?: Error) => void;

describe("parallel_machine", () => {
    function harness(
        items: string[],
        taskDescriptor: TaskDescriptor<string>,
        keyParallelism: number,
        overallParallelism: number | null,
        callback: Callback,
        expectation: {[key: string]: number[]},
    ) {
        const result: {[key: string]: number[]}  = {};
        let i = 0;
        const executor: TaskExecutor<string> = (item: string, cb: Callback) => {
            result[item] = result[item] || [];
            result[item].push(i);
            i += 1;
            setImmediate(cb);
        };

        parallel_machine(items, {keyParallelism, overallParallelism, executor, taskDescriptor}, (error: Error) => {
            expect(error).to.be.undefined;
            expect(result).to.eql(expectation);
            callback();
        });
    }

    describe("single key TaskDescriptor", () => {
        it("should do nothing for an empty list", (done) => {
            harness([], _.identity, 1, 1, done, {});
        });

        it("should be able to start a single task", (done) => {
            harness(["a"], _.identity, 1, 1, done, {
                a: [0],
            });
        });

        it("should complete tasks in series", (done) => {
            harness("a b c".split(" "), _.identity, 1, 1, done, {
                a: [0],
                b: [1],
                c: [2],
            });
        });

        it("should complete tasks in parallel", (done) => {
            harness("a b c".split(" "), _.identity, 1, 2, done, {
                a: [0],
                b: [1],
                c: [2],
            });
        });

        it("should distribute work across cluster", (done) => {
            let items = "a a a b".split(" ");
            harness(items, _.identity, 2, 4, done, {
                a: [0, 1, 3],
                b: [2],
            });
        });

        it("should distribute work across cluster evenly", (done) => {
            let items = "a b c b c c b d b a a a b b".split(" ");
            return harness(items, _.identity, 2, 5, done, {
                a: [0, 1, 7, 8],
                b: [2, 3, 9, 10, 12, 13],
                c: [4, 5, 11],
                d: [6],
            });
        });
    });

    describe("Random fuzz tests", () => {
        const mod5 = (n: number) => (n % 5).toString()

        it("success case, with data", (done) => {
            const perLetterParallelism = 3;
            const overallParallelism = 10;

            const counts: {[name: string]: number} = {};
            let underWay = 0;

            const executor: TaskExecutor<number> = (index: number, callback: Callback) => {
                counts[index] = counts[index] || 0;
                expect(++underWay).to.be.most(overallParallelism);
                expect(++counts[index]).to.be.most(perLetterParallelism);

                setTimeout(() => {
                    counts[index]--;
                    underWay--;
                    callback();
                }, _.random(3, 100));
            };

            parallel_machine(_.range(0, 100), {
                keyParallelism: perLetterParallelism,
                overallParallelism,
                executor,
                taskDescriptor: mod5,
            }, done);
        });

        it("should fail fast", (done) => {
            const testError = new Error("Done");
            let started = 0;
            let finished = 0;

            const executor: TaskExecutor<number> = (index: number, callback: Callback) => {
                if (index === 10) {
                    callback(testError);
                } else {
                    started++;
                    setTimeout(() => {
                        finished++;
                        callback();
                    }, 100);
                }
            };

            parallel_machine(_.range(0, 100), {
                keyParallelism: 2,
                overallParallelism: 5,
                executor,
                taskDescriptor: mod5,
            }, (error: Error) => {
                expect(error).to.eql(testError);
                expect(started).to.eql(10);
                expect(finished).to.be.lessThan(10);
                done();
            });
        });
    });
});
