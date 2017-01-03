# parallel_machine
[![Build Status](https://travis-ci.org/macobo/parallel_machine.svg?branch=master)](https://travis-ci.org/macobo/parallel_machine)

Javascript library for distributing async computation based on a distribution key.

# Installation

`npm install parallel_machine`

# Example

Scenario: we want to run an expensive database migration across many tables in a large database cluster.
To avoid bringing down any single database, we try to distribute the load across all the database clusters via parallel_machine

```javascript
import * as parallel_machine from "parallel_machine";

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
