import { google } from "googleapis";
import { readFileSync } from "fs";

/**
 * Simple script to get Google Calendar refresh token
 * Run this once locally, then use the output for GitHub secrets
 */
async function getRefreshToken() {
  console.log("Google Calendar Authorization");
  console.log("============================\n");

  try {
    const credsFile = readFileSync("./google-credentials.json", "utf-8");
    const credsData = JSON.parse(credsFile);
    const credentials = credsData.installed || credsData;

    const oauth2Client = new google.auth.OAuth2(
      credentials.client_id,
      credentials.client_secret,
      "urn:ietf:wg:oauth:2.0:oob" // Out-of-band flow for CLI
    );

    // Generate auth URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/calendar.readonly"],
    });

    console.log("Visit this URL to authorize:");
    console.log(authUrl);
    console.log("\nYou'll get a code. Paste it below.\n");

    // Read code from stdin
    process.stdout.write("Enter the authorization code: ");

    let code = "";
    for await (const chunk of process.stdin) {
      code = chunk.toString().trim();
      break;
    }

    if (!code) {
      console.error("No code provided");
      process.exit(1);
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    console.log("\n✓ Success!\n");
    console.log("Add this to GitHub secrets as GOOGLE_CALENDAR_CREDS:\n");

    const finalCreds = {
      client_id: credentials.client_id,
      client_secret: credentials.client_secret,
      redirect_uris: credentials.redirect_uris || ["urn:ietf:wg:oauth:2.0:oob"],
      refresh_token: tokens.refresh_token,
    };

    console.log(JSON.stringify(finalCreds, null, 2));
    console.log("\n(Copy the entire JSON above)");

    process.exit(0);
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

getRefreshToken();
