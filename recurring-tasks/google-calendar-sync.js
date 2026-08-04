import { google } from "googleapis";
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const CALENDAR_DB_ID = process.env.CALENDAR_DB_ID;

/**
 * Sync Google Calendar events from multiple accounts to Notion
 */
async function syncGoogleCalendarToNotion() {
  console.log("Starting Google Calendar sync...");

  try {
    // Parse credentials from env - can be array or single object
    if (!process.env.GOOGLE_CALENDAR_CREDS) {
      console.log(
        "GOOGLE_CALENDAR_CREDS not set. Skipping Google Calendar sync."
      );
      return;
    }

    let credentialsArray = [];
    try {
      const parsed = JSON.parse(process.env.GOOGLE_CALENDAR_CREDS);
      credentialsArray = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      console.error("Failed to parse GOOGLE_CALENDAR_CREDS:", e.message);
      return;
    }

    console.log(`Found ${credentialsArray.length} calendar credential(s)\n`);

    // Clean up past events first
    console.log("Cleaning up past calendar entries from Notion...");
    await deletePastCalendarEntries();
    console.log("Past entries cleaned up.\n");

    // Sync events from each calendar
    for (let i = 0; i < credentialsArray.length; i++) {
      const credentials = credentialsArray[i];
      const accountName = credentials.email || `Account ${i + 1}`;

      try {
        await syncCalendar(credentials, accountName);
      } catch (error) {
        console.error(`Failed to sync ${accountName}:`, error.message);
      }
    }

    console.log("\nGoogle Calendar sync complete!");
  } catch (error) {
    console.error("Google Calendar sync error:", error);
    throw error;
  }
}

/**
 * Delete (archive) past calendar entries from Notion
 */
async function deletePastCalendarEntries() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    const todayString = today.toISOString().split("T")[0];

    // Query for all entries with dates before today
    const pastEntries = await notion.databases.query({
      database_id: CALENDAR_DB_ID,
      filter: {
        property: "Date",
        date: {
          before: todayString,
        },
      },
    });

    if (pastEntries.results.length === 0) {
      console.log("  No past entries to clean up");
      return;
    }

    console.log(`  Found ${pastEntries.results.length} past entries`);

    // Archive each past entry
    for (const page of pastEntries.results) {
      try {
        const eventTitle = page.properties.Name?.title?.[0]?.plain_text || "Untitled";
        await notion.pages.update({
          page_id: page.id,
          archived: true,
        });
        console.log(`    ✓ Archived: ${eventTitle}`);
      } catch (error) {
        console.error(`    ✗ Failed to archive:`, error.message);
      }
    }
  } catch (error) {
    console.error("Error cleaning up past calendar entries:", error.message);
  }
}

/**
 * Sync a single calendar account (pulls from ALL calendars under that account)
 */
async function syncCalendar(credentials, accountName) {
  console.log(`Syncing ${accountName}...`);

  // Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    credentials.redirect_uris?.[0] || "urn:ietf:wg:oauth:2.0:oob"
  );

  // Set refresh token
  oauth2Client.setCredentials({
    refresh_token: credentials.refresh_token,
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  // Get time range
  const now = new Date();
  const weekFromNow = new Date(now);
  weekFromNow.setDate(now.getDate() + 7);

  try {
    // Get all calendars for this account
    const calendarList = await calendar.calendarList.list();
    const calendars = calendarList.data.items || [];

    console.log(`  Found ${calendars.length} calendar(s)`);

    let allEvents = [];

    // Fetch events from each calendar
    for (const cal of calendars) {
      try {
        const events = await calendar.events.list({
          calendarId: cal.id,
          timeMin: now.toISOString(),
          timeMax: weekFromNow.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
        });

        if (events.data.items && events.data.items.length > 0) {
          console.log(
            `    ${cal.summary || "Untitled calendar"}: ${events.data.items.length} events`
          );
          allEvents.push(...events.data.items);
        }
      } catch (error) {
        console.error(
          `    Failed to fetch from ${cal.summary}:`,
          error.message
        );
      }
    }

    if (allEvents.length === 0) {
      console.log(`  No events found for ${accountName}`);
      return;
    }

    console.log(`  Total: ${allEvents.length} events to sync`);

    // Sync each event to Notion
    for (const event of allEvents) {
      try {
        const eventDate = event.start.dateTime || event.start.date;

        // Check if event already exists in Notion
        const existing = await notion.databases.query({
          database_id: CALENDAR_DB_ID,
          filter: {
            and: [
              {
                property: "Name",
                title: {
                  equals: event.summary || "Untitled",
                },
              },
              {
                property: "Date",
                date: {
                  equals: eventDate.split("T")[0],
                },
              },
            ],
          },
        });

        if (existing.results.length > 0) {
          continue;
        }

        // Create new event in Notion
        await notion.pages.create({
          parent: {
            database_id: CALENDAR_DB_ID,
          },
          properties: {
            Name: {
              title: [
                {
                  text: {
                    content: event.summary || "Untitled",
                  },
                },
              ],
            },
            Date: {
              date: {
                start: eventDate.split("T")[0],
              },
            },
          },
        });

        console.log(`    ✓ ${event.summary}`);
      } catch (error) {
        console.error(`    ✗ ${event.summary}:`, error.message);
      }
    }
  } catch (error) {
    console.error(`Error syncing ${accountName}:`, error.message);
  }
}

// Run sync
syncGoogleCalendarToNotion();
