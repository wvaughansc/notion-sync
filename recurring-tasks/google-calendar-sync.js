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
 * Sync a single calendar
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

  // Get events for next week
  const now = new Date();
  const weekFromNow = new Date(now);
  weekFromNow.setDate(now.getDate() + 7);

  const events = await calendar.events.list({
    calendarId: "primary",
    timeMin: now.toISOString(),
    timeMax: weekFromNow.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  if (!events.data.items || events.data.items.length === 0) {
    console.log(`  No events found for ${accountName}`);
    return;
  }

  console.log(`  Found ${events.data.items.length} events`);

  // Sync each event to Notion
  for (const event of events.data.items) {
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
}

// Run sync
syncGoogleCalendarToNotion();
