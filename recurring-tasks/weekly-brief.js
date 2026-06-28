import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database IDs from environment
const CALENDAR_DB_ID = process.env.CALENDAR_DB_ID;
const TASKS_DB_ID = process.env.TASKS_DB_ID;
const SERVICES_EVENTS_DB_ID = process.env.SERVICES_EVENTS_DB_ID;
const PROJECTS_DB_ID = process.env.PROJECTS_DB_ID;
const HOUSE_PROJECTS_DB_ID = process.env.HOUSE_PROJECTS_DB_ID;
const BRIEF_PAGE_ID = process.env.BRIEF_PAGE_ID;

// Debug: log environment variables
console.log("Environment check:");
console.log("CALENDAR_DB_ID:", CALENDAR_DB_ID ? "✓" : "undefined");
console.log("TASKS_DB_ID:", TASKS_DB_ID ? "✓" : "undefined");
console.log("SERVICES_EVENTS_DB_ID:", SERVICES_EVENTS_DB_ID ? "✓" : "undefined");
console.log("PROJECTS_DB_ID:", PROJECTS_DB_ID ? "✓" : "undefined");
console.log("HOUSE_PROJECTS_DB_ID:", HOUSE_PROJECTS_DB_ID ? "✓" : "undefined");
console.log("BRIEF_PAGE_ID:", BRIEF_PAGE_ID ? "✓" : "undefined");

/**
 * Get the date range for the coming week (Monday - Sunday)
 * If today is Monday, use today as start. Otherwise, use next Monday.
 */
function getWeekRange() {
  const today = new Date();
  const dayOfWeek = today.getDay();

  let weekStart = new Date(today);
  
  if (dayOfWeek === 0) {
    // Today is Sunday, next Monday
    weekStart.setDate(today.getDate() + 1);
  } else if (dayOfWeek > 1) {
    // Tuesday-Sunday, calculate next Monday
    weekStart.setDate(today.getDate() + (8 - dayOfWeek));
  }
  // If Monday (dayOfWeek === 1), use today as-is

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6); // Sunday

  return { weekStart, weekEnd };
}

/**
 * Query a Notion database for items with a date in the given range
 * @param {string} databaseId - The Notion database ID
 * @param {string} dateProperty - The property name to filter by (e.g., "Date", "Due Date")
 * @param {Date} startDate - Start of range
 * @param {Date} endDate - End of range
 * @returns {Promise<Array>} Array of Notion records
 */
async function queryDatabaseByDateRange(
  databaseId,
  dateProperty,
  startDate,
  endDate
) {
  const results = [];
  let hasMore = true;
  let startCursor = undefined;

  while (hasMore) {
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        and: [
          {
            property: dateProperty,
            date: {
              on_or_after: startDate.toISOString().split("T")[0],
            },
          },
          {
            property: dateProperty,
            date: {
              on_or_before: endDate.toISOString().split("T")[0],
            },
          },
        ],
      },
      start_cursor: startCursor,
    });

    console.log(
      `Query returned ${response.results.length} results (has_more: ${response.has_more})`
    );
    results.push(...response.results);
    hasMore = response.has_more;
    startCursor = response.next_cursor;
  }

  return results;
}

/**
 * Extract the date from a Notion date property
 */
function extractDate(dateValue) {
  if (!dateValue || !dateValue.date) return null;
  return new Date(dateValue.date.start);
}

/**
 * Get a readable title from a Notion page
 */
function getPageTitle(page) {
  const props = page.properties;

  // Try common title properties in order
  for (const key of ["Name", "Title", "Task", "Tasks"]) {
    if (props[key] && props[key].title && props[key].title.length > 0) {
      return props[key].title.map((t) => t.plain_text).join("");
    }
  }

  // Fallback to first rich_text property found
  for (const key in props) {
    if (
      props[key].type === "rich_text" &&
      props[key].rich_text &&
      props[key].rich_text.length > 0
    ) {
      return props[key].rich_text.map((t) => t.plain_text).join("");
    }
  }

  return "Untitled";
}

/**
 * Check if a task is completed
 */
function isTaskCompleted(page) {
  const props = page.properties;

  // Check for common status properties
  for (const key of ["Status", "Done", "Completed"]) {
    if (props[key]) {
      const prop = props[key];
      if (prop.type === "status") {
        return prop.status?.name === "Done";
      } else if (prop.type === "checkbox") {
        return prop.checkbox === true;
      }
    }
  }

  return false;
}

/**
 * Organize items by day of week
 */
function organizeByDay(items, dateProperty, filterCompleted = false) {
  const dayMap = {
    0: { name: "Sunday", items: [] },
    1: { name: "Monday", items: [] },
    2: { name: "Tuesday", items: [] },
    3: { name: "Wednesday", items: [] },
    4: { name: "Thursday", items: [] },
    5: { name: "Friday", items: [] },
    6: { name: "Saturday", items: [] },
  };

  items.forEach((item) => {
    // Skip completed tasks if filtering
    if (filterCompleted && isTaskCompleted(item)) {
      return;
    }

    const dateValue = item.properties[dateProperty];
    const date = extractDate(dateValue);

    if (date) {
      const dayIndex = date.getDay();
      dayMap[dayIndex].items.push({
        title: getPageTitle(item),
        date,
        url: item.url,
      });
    }
  });

  // Sort items within each day by time
  Object.values(dayMap).forEach((day) => {
    day.items.sort((a, b) => a.date - b.date);
  });

  return dayMap;
}

/**
 * Build Notion blocks for the weekly brief
 */
function buildBriefBlocks(allItems, weekStart, houseProjectsByDay) {
  const blocks = [];

  // Header
  const weekEndDate = new Date(weekStart);
  weekEndDate.setDate(weekStart.getDate() + 6);
  const dateRange = `${weekStart.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} – ${weekEndDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

  blocks.push({
    object: "block",
    type: "heading_1",
    heading_1: {
      rich_text: [
        {
          type: "text",
          text: {
            content: `Weekly Brief: ${dateRange}`,
          },
        },
      ],
    },
  });

  blocks.push({
    object: "block",
    type: "divider",
    divider: {},
  });

  // Iterate through each day and build sections
  const dayOfWeek = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const dayIndex = weekStart.getDay();

  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(weekStart);
    dayDate.setDate(weekStart.getDate() + i);
    const dayName = dayOfWeek[(dayIndex + i) % 7];

    // Collect all items for this day
    const dayItems = [];

    for (const [source, organized] of Object.entries(allItems)) {
      const dateIndex = dayDate.getDay();
      if (organized[dateIndex] && organized[dateIndex].items.length > 0) {
        dayItems.push({
          source,
          items: organized[dateIndex].items,
        });
      }
    }

    // Only add day section if there are items
    if (dayItems.length > 0) {
      // Day heading with date
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [
            {
              type: "text",
              text: {
                content: `${dayName}, ${dayDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}`,
              },
            },
          ],
        },
      });

      // Items for this day, grouped by source
      dayItems.forEach(({ source, items }) => {
        // Source subheading
        blocks.push({
          object: "block",
          type: "heading_3",
          heading_3: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: source,
                },
              },
            ],
          },
        });

        // List items
        items.forEach((item) => {
          blocks.push({
            object: "block",
            type: "bulleted_list_item",
            bulleted_list_item: {
              rich_text: [
                {
                  type: "text",
                  text: {
                    content: item.title,
                    link: item.url ? { url: item.url } : null,
                  },
                },
              ],
            },
          });
        });
      });

      blocks.push({
        object: "block",
        type: "divider",
        divider: {},
      });
    }
  }

  // House Projects section (separate from day-by-day)
  const houseProjectsWithDates = Object.values(houseProjectsByDay)
    .flatMap((day) => day.items)
    .filter((item) => item && item.title);

  if (houseProjectsWithDates.length > 0) {
    blocks.push({
      object: "block",
      type: "divider",
      divider: {},
    });

    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "House Projects",
            },
          },
        ],
      },
    });

    houseProjectsWithDates.forEach((item) => {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [
            {
              type: "text",
              text: {
                content: `${item.title} (${item.date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })})`,
                link: item.url ? { url: item.url } : null,
              },
            },
          ],
        },
      });
    });
  }

  // Undated Projects and House Projects section
  const undatedProjects = projectItems.filter(
    (item) => !item.properties["Due Date"]?.date
  );
  const undatedHouseProjects = houseProjectItems.filter(
    (item) => !item.properties["Planned Date"]?.date
  );

  if (undatedProjects.length > 0 || undatedHouseProjects.length > 0) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [
          {
            type: "text",
            text: {
              content: "No Due Date",
            },
          },
        ],
      },
    });

    if (undatedProjects.length > 0) {
      blocks.push({
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [
            {
              type: "text",
              text: {
                content: "Projects",
              },
            },
          ],
        },
      });

      undatedProjects.forEach((item) => {
        blocks.push({
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: getPageTitle(item),
                  link: item.url ? { url: item.url } : null,
                },
              },
            ],
          },
        });
      });
    }

    if (undatedHouseProjects.length > 0) {
      blocks.push({
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [
            {
              type: "text",
              text: {
                content: "House Projects",
              },
            },
          ],
        },
      });

      undatedHouseProjects.forEach((item) => {
        blocks.push({
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: getPageTitle(item),
                  link: item.url ? { url: item.url } : null,
                },
              },
            ],
          },
        });
      });
    }
  }

  return blocks;
}

/**
 * Clear all blocks from a page
 */
async function clearPageBlocks(pageId) {
  const page = await notion.blocks.retrieve({ block_id: pageId });
  const blocks = await notion.blocks.children.list({ block_id: pageId });

  for (const block of blocks.results) {
    try {
      await notion.blocks.delete({ block_id: block.id });
    } catch (error) {
      console.error(`Failed to delete block ${block.id}:`, error.message);
    }
  }
}

/**
 * Append blocks to a page
 */
async function appendBlocksToPage(pageId, blocks) {
  // Notion API has a limit of 100 blocks per request, so batch them
  const batchSize = 100;

  for (let i = 0; i < blocks.length; i += batchSize) {
    const batch = blocks.slice(i, i + batchSize);
    await notion.blocks.children.append({
      block_id: pageId,
      children: batch,
    });
  }
}

/**
 * Main function
 */
async function buildWeeklyBrief() {
  console.log("Starting weekly brief generation...");

    const { weekStart, weekEnd } = getWeekRange();
    console.log(
      `Week range: ${weekStart.toDateString()} - ${weekEnd.toDateString()}`
    );

    // Format for logging
    const formatLocalDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };
    console.log(
      `Querying for dates: ${formatLocalDate(weekStart)} to ${formatLocalDate(weekEnd)}`
    );

    // Calculate extended ranges
    const today = new Date();
    const twoWeeksOut = new Date(today);
    twoWeeksOut.setDate(today.getDate() + 14);
    const oneMonthOut = new Date(today);
    oneMonthOut.setDate(today.getDate() + 30);

  try {
    // Query all databases
    console.log("Querying databases...");

    let calendarItems = [];
    let taskItems = [];
    let servicesItems = [];
    let projectItems = [];
    let houseProjectItems = [];

    // Query Calendar DB
    try {
      calendarItems = await queryDatabaseByDateRange(
        CALENDAR_DB_ID,
        "Date",
        weekStart,
        weekEnd
      );
      console.log(`Found ${calendarItems.length} calendar items`);
    } catch (error) {
      console.error("Failed to query Calendar DB:", error.message);
    }

    // Query Tasks DB
    try {
      taskItems = await queryDatabaseByDateRange(
        TASKS_DB_ID,
        "Due Date",
        weekStart,
        weekEnd
      );
      console.log(`Found ${taskItems.length} task items`);
      // Debug: show first 3 tasks and their dates
      if (taskItems.length > 0) {
        console.log("Sample tasks:");
        taskItems.slice(0, 3).forEach((item) => {
          const title = getPageTitle(item);
          const dueDate = item.properties["Due Date"]?.date?.start || "no date";
          console.log(`  - ${title}: ${dueDate}`);
        });
      }
    } catch (error) {
      console.error("Failed to query Tasks DB:", error.message);
    }

    // Query Services/Events DB
    try {
      servicesItems = await queryDatabaseByDateRange(
        SERVICES_EVENTS_DB_ID,
        "Date",
        weekStart,
        weekEnd
      );
      console.log(`Found ${servicesItems.length} services/events items`);
    } catch (error) {
      console.error("Failed to query Services/Events DB:", error.message);
    }

    // Query House Projects DB (next 2 weeks)
    try {
      houseProjectItems = await queryDatabaseByDateRange(
        HOUSE_PROJECTS_DB_ID,
        "Planned Date",
        today,
        twoWeeksOut
      );
      console.log(`Found ${houseProjectItems.length} house project items`);
    } catch (error) {
      console.error("Failed to query House Projects DB:", error.message);
    }

    // Query Projects DB (next 1 month)
    try {
      console.log(`Attempting to query Projects DB: ${PROJECTS_DB_ID}`);
      projectItems = await queryDatabaseByDateRange(
        PROJECTS_DB_ID,
        "Due Date",
        today,
        oneMonthOut
      );
      console.log(`Found ${projectItems.length} project items`);
    } catch (error) {
      console.error("Failed to query Projects DB:", error.message);
      console.error("Projects DB ID:", PROJECTS_DB_ID);
      console.error("Full error:", error);
    }

    // Organize by day (excluding house projects - they get their own section)
    console.log("Organizing by day...");
    const allItems = {
      Calendar: organizeByDay(calendarItems, "Date", false),
      Tasks: organizeByDay(taskItems, "Due Date", true),
      Services: organizeByDay(servicesItems, "Date", false),
      Projects: organizeByDay(projectItems, "Due Date", false),
    };

    // Organize house projects separately (by date, with dates only)
    const houseProjectsByDay = organizeByDay(
      houseProjectItems.filter((item) => item.properties["Planned Date"]?.date),
      "Planned Date",
      false
    );

    // Build blocks
    console.log("Building brief blocks...");
    const blocks = buildBriefBlocks(allItems, weekStart, houseProjectsByDay);

    // Update page
    console.log("Clearing existing blocks...");
    await clearPageBlocks(BRIEF_PAGE_ID);

    console.log("Appending new blocks...");
    await appendBlocksToPage(BRIEF_PAGE_ID, blocks);

    console.log("Weekly brief generated successfully!");
  } catch (error) {
    console.error("Error building weekly brief:", error);
    throw error;
  }
}

// Run it
buildWeeklyBrief();
