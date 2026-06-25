import { Client } from "@notionhq/client";

const notion = new Client({
auth: process.env.NOTION_TOKEN,
});

const TASKS_DB_ID = process.env.TASKS_DB_ID;

const today = new Date();

const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, "0");
const dd = String(today.getDate()).padStart(2, "0");

const todayDate = `${yyyy}-${mm}-${dd}`;

const dayOfWeek = today.getDay(); // 0=Sun,1=Mon...
const dayOfMonth = today.getDate();

const tasksToCreate = [];

function addTask(name, time = null) {
tasksToCreate.push({
name,
time,
});
}

// DAILY
addTask("Feed Dogs", "08:00");

// WEEKDAYS
if (dayOfWeek >= 1 && dayOfWeek <= 5) {
addTask("Water Grass", "08:00");
}

// MONDAY
if (dayOfWeek === 1) {
addTask("Timesheet", "09:00");
addTask("Trash Pickup", "21:00");
}

// THURSDAY
if (dayOfWeek === 4) {
addTask("Split Songs", "14:00");
}

// FRIDAY
if (dayOfWeek === 5) {
addTask("Update PCO Notes", "14:00");
}

// MONTHLY
if (dayOfMonth === 15) {
addTask("Send Blockout Email");
}

if (dayOfMonth === 16) {
addTask("Greer Schedule");
}

// QUARTERLY
if (
dayOfMonth === 1 &&
[1, 4, 7, 10].includes(today.getMonth() + 1)
) {
addTask("Change Air Filters");
}

async function createTask(task) {
const dueDate = task.time
? `${todayDate}T${task.time}:00`
: todayDate;

await notion.pages.create({
parent: {
database_id: TASKS_DB_ID,
},
properties: {
Name: {
title: [
{
text: {
content: task.name,
},
},
],
},
"Due Date": {
date: {
start: dueDate,
},
},
},
});

console.log(`Created: ${task.name}`);
}

async function run() {
console.log(`Creating ${tasksToCreate.length} tasks`);

for (const task of tasksToCreate) {
await createTask(task);
}
}

run();
