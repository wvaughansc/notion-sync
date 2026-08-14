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

// EDT offset (UTC-4) - adjust to -05:00 for EST if needed
const tzOffset = "-04:00";

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
  icon = "📌",
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
icon,
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
icon: "🐕",
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
icon: "💦",
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
icon: "🕑",
});

addTask({
taskName: "Trash Pickup",
area: "Personal",
priority: "Medium",
time: "21:00",
icon: "🗑️",
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
area: "Grace",
priority: "High",
time: "14:00",
icon: "🎤",
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
area: "Grace",
priority: "Medium",
time: "14:00",
icon: "📝",
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
area: "Grace",
priority: "High",
icon: "📨",
});
}

if (dayOfMonth === 16) {
addTask({
taskName: "Greer Schedule",
area: "Grace",
priority: "High",
icon: "🗓️",
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
icon: '',
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

    await notion.pages.create({
      parent: {
        database_id: TASKS_DB_ID,
      },
      icon: {
        type: "emoji",
        emoji: task.icon, // Add this
      },
      properties: properties,
    });
    console.log(`✅ Created: ${task.taskName}`);
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
