# parallel_machine
[![Build Status](https://travis-ci.org/macobo/parallel_machine.svg?branch=master)](https://travis-ci.org/macobo/parallel_machine)
[![NPM version][npm-image]][npm-url] 

Javascript library for distributing async computation based on a distribution key.

# Installation

`npm install parallel_machine`

# Example

Scenario: We want to run multiple expensive database migrations across many tables in a large database cluster.

We try to distribute the load across all the database hosts via parallel_machine. This will both minimize the operation time as we'll be doing multiple operations at once whilst avoiding overloading a single host.

```javascript
var parallel_machine = require("parallel_machine");

tables = [
  {databaseHost: 'a', tableName: 'foo'}
  // ...
]

function expensiveDatabaseMigration(task, callback) {
  // ...
}

var options = {
  // Key which we distribute over - in this case the host of the task we're about to run.
  taskDescriptor: (task) -> task.databaseHost,
  // Async function that executes the given task.
  executor: expensiveDatabaseMigration,
  // (Up to) how many tasks to execute on a host at a time in parallel.
  keyParallelism: 5,
  // How many tasks to execute overall in parallel. Missing or null means unlimited.
  overallParallelism: 30
}

parallel_machine(tables, options, (err) => {
  console.log('Tasks complete.', err);
});
```


[npm-url]: https://npmjs.org/package/parallel_machine
[npm-image]: http://img.shields.io/npm/v/parallel_machine.svg
