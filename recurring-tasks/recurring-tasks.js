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

// Get timezone offset (EDT/EST)
function getTimeZoneOffset() {
  const offset = -today.getTimezoneOffset(); // in minutes
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  const sign = offset >= 0 ? '+' : '-';
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

const tzOffset = getTimeZoneOffset();

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
  status = "Not Done",
  time = null,
  }) {
  const dueDate = time
  ? `${todayDate}T${time}:00${tzOffset}`
  : todayDate;

tasksToCreate.push({
taskName,
area,
priority,
status,
dueDate,
hasTime: time !== null,
});
}

/*                                                                         |
| -------------------------------------------------------------------------- |
| DAILY TASKS                                                                |
| -------------------------------------------------------------------------- |
| */                                                                         

addTask({
taskName: "Feed Dogs",
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
taskName: "Water Grass",
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
taskName: "Timesheet",
area: "QA",
priority: "High",
time: "09:00",
});

addTask({
taskName: "Trash Pickup",
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
taskName: "Split Songs",
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
taskName: "Update PCO Notes",
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
taskName: "Send Blockout Email",
area: "QA",
priority: "High",
});
}

if (dayOfMonth === 16) {
addTask({
taskName: "Greer Schedule",
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
taskName: "Change Air Filters",
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
    const properties = {
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
    };

    // Only add Remind field if the task has a specific time
    if (task.hasTime) {
      properties.Remind = {
        select: {
          name: "At time of event",
        },
      };
    }

    await notion.pages.create({
      parent: {
        database_id: TASKS_DB_ID,
      },
      properties: properties,
    });
    console.log(`✅ Created: ${task.taskName}`);
    // Wait 2 seconds between task creations to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  } catch (error) {
    console.error(`❌ Failed to create ${task.taskName}:`, error.message);
  }
}

async function run() {
  console.log(`Creating ${tasksToCreate.length} recurring task(s)...`);
  
  for (const task of tasksToCreate) {
    console.log(`\nProcessing task:`, task);
    await createTask(task);
  }
  
  console.log("Done.");
}

run().catch((error) => {
console.error(error);
process.exit(1);
});
