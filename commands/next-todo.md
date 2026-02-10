---
description: Queue the next task to do after the current one finishes
argument-hint:
  - task description
---

# Queue Next Task

The user is sending this message to queue a task for you to do next. They are NOT asking you to stop your current work.

## Critical Rules

1. **DO NOT stop or interrupt your current task.** The user is worried you will abandon your work-in-progress if they send a new message. Continue what you are doing.
2. **Acknowledge the queued task briefly** (one short line), then immediately resume your current work.
3. **When your current task is completed**, read the queued task description below and begin working on it.

## Queued Task

$ARGUMENTS

## Behavior

- If you are currently working on something: acknowledge the queue, finish your current task, then start the queued task.
- If you have no current task: start the queued task immediately.
