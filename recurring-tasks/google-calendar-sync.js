import { google } from "googleapis";
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const CALENDAR_DB_ID = process.env.CALENDAR_DB_ID;

/**
 * Sync Google Calendar events to Notion
 */
async function syncGoogleCalendarToNotion() {
  console.log("Starting Google Calendar sync...");

  try {
    // Parse Google credentials
    const credentials = JSON.parse(process.env.GOOGLE_CALENDAR_CREDS);

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      credentials.client_id,
      credentials.client_secret,
      credentials.redirect_uris[0]
    );

    // Set refresh token
    if (!credentials.refresh_token) {
      throw new Error(
        "No refresh_token found in credentials. Run setup-google-calendar.js first."
      );
    }

    oauth2Client.setCredentials({
      refresh_token: credentials.refresh_token,
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    // Get events for next week
    const now = new Date();
    const weekFromNow = new Date(now);
    weekFromNow.setDate(now.getDate() + 7);

    console.log(
      `Fetching calendar events from ${now.toDateString()} to ${weekFromNow.toDateString()}`
    );

    const events = await calendar.events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: weekFromNow.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    if (!events.data.items || events.data.items.length === 0) {
      console.log("No calendar events found for next week");
      return;
    }

    console.log(`Found ${events.data.items.length} calendar events`);

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
          console.log(`Event already exists: ${event.summary}`);
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

        console.log(`Synced: ${event.summary}`);
      } catch (error) {
        console.error(`Failed to sync event ${event.summary}:`, error.message);
      }
    }

    console.log("Google Calendar sync complete!");
  } catch (error) {
    console.error("Google Calendar sync error:", error);
    throw error;
  }
}

// Run sync
syncGoogleCalendarToNotion();
