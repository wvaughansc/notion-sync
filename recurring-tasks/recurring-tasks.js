import { Client } from "@notionhq/client";

const notion = new Client({
auth: process.env.NOTION_TOKEN,
});

const TASKS_DB_ID = process.env.TASKS_DB_ID;

// Get today's date
const today = new Date();

const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, "0");
const dd = String(today.getDate()).padStart(2, "0");

const todayDate = `${yyyy}-${mm}-${dd}`;

const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, 2=Tue...
const dayOfMonth = today.getDate();

const tasksToCreate = [];

/**

* Add a task to today's queue
  */
  function addTask({
  taskName,
  area,
  priority,
  status = "Not Started",
  time = null,
  }) {
  const dueDate = time
  ? `${todayDate}T${time}:00`
  : todayDate;

tasksToCreate.push({
taskName,
area,
priority,
status,
dueDate,
});
}

/*                                                                         |
| -------------------------------------------------------------------------- |
| DAILY TASKS                                                                |
| -------------------------------------------------------------------------- |
| */                                                                         

addTask({
taskName: "Feed Dogs1",
area: "Personal",
priority: "High",
time: "08:00",
});

/*                                                                         |
| -------------------------------------------------------------------------- |
| WEEKDAY TASKS                                                              |
| -------------------------------------------------------------------------- |
| */                                                                         

if (dayOfWeek >= 1 && dayOfWeek <= 5) {
addTask({
taskName: "Water Grass1",
area: "Personal",
priority: "Medium",
time: "08:00",
});
}

/*                                                                         |
| -------------------------------------------------------------------------- |
| MONDAY TASKS                                                               |
| -------------------------------------------------------------------------- |
| */                                                                         

if (dayOfWeek === 1) {
addTask({
taskName: "Timesheet1",
area: "QA",
priority: "High",
time: "09:00",
});

addTask({
taskName: "Trash Pickup1",
area: "Personal",
priority: "Medium",
time: "21:00",
});
}

/*                                                                         |
| -------------------------------------------------------------------------- |
| THURSDAY TASKS                                                             |
| -------------------------------------------------------------------------- |
| */                                                                         

if (dayOfWeek === 4) {
addTask({
taskName: "Split Songs1",
area: "Church",
priority: "High",
time: "14:00",
});
}

/*                                                                         |
| -------------------------------------------------------------------------- |
| FRIDAY TASKS                                                               |
| -------------------------------------------------------------------------- |
| */                                                                         

if (dayOfWeek === 5) {
addTask({
taskName: "Update PCO Notes1",
area: "Church",
priority: "Medium",
time: "14:00",
});
}

/*                                                                         |
| -------------------------------------------------------------------------- |
| MONTHLY TASKS                                                              |
| -------------------------------------------------------------------------- |
| */                                                                         

if (dayOfMonth === 15) {
addTask({
taskName: "Send Blockout Email1",
area: "QA",
priority: "High",
});
}

if (dayOfMonth === 16) {
addTask({
taskName: "Greer Schedule1",
area: "QA",
priority: "High",
});
}

/*                                                                         |
| -------------------------------------------------------------------------- |
| QUARTERLY TASKS                                                            |
| -------------------------------------------------------------------------- |
|                                                                            |
| January 1                                                                  |
| April 1                                                                    |
| July 1                                                                     |
| October 1                                                                  |
|                                                                            |
| */                                                                         

if (
dayOfMonth === 1 &&
[1, 4, 7, 10].includes(today.getMonth() + 1)
) {
addTask({
taskName: "Change Air Filters1",
area: "Personal",
priority: "Medium",
});
}

/*                                                                         |
| -------------------------------------------------------------------------- |
| CREATE TASKS                                                               |
| -------------------------------------------------------------------------- |
| */                                                                         

async function createTask(task) {
 console.log(`Attempting to create task with data:`, JSON.stringify(task, null, 2));
  try {
    await notion.pages.create({
      parent: {
        database_id: TASKS_DB_ID,
      },
      properties: {
        Tasks: {
          title: [
            {
              text: {
                content: task.taskName,
              },
            },
          ],
        },
        Status: {
          status: {
            name: task.status,
          },
        },
        Priority: {
          select: {
            name: task.priority,
          },
        },
        Area: {
          select: {
            name: task.area,
          },
        },
        "Due Date": {
          date: {
            start: task.dueDate,
          },
        },
      },
    });
    console.log(`Attempting to create task with data:`, JSON.stringify(task, null, 2));
    console.log(`✅ Created: ${task.taskName}`);
    // Wait 1 second between task creations to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (error) {
    console.error(`❌ Failed to create ${task.taskName}:`, error.message);
  }
}

async function run() {
  console.log(`Creating ${recurringTasks.length} recurring task(s)...`);
  
  for (const task of recurringTasks) {
    console.log(`\nProcessing task:`, task); // Add this
    await createTask(task);
  }
  
  console.log("Done.");
}

run().catch((error) => {
console.error(error);
process.exit(1);
});
