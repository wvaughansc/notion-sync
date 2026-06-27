import { google } from "googleapis";
import { readFileSync, writeFileSync } from "fs";
import open from "open";
import http from "http";

const PORT = 3000;

/**
 * One-time setup to get Google Calendar OAuth refresh token
 */
async function setupGoogleCalendarAuth() {
  console.log("Google Calendar OAuth Setup");
  console.log("===========================\n");

  // Read the credentials file you downloaded from Google Cloud
  let credentials;
  try {
    const credsFile = readFileSync("./google-credentials.json", "utf-8");
    const credsData = JSON.parse(credsFile);
    // Handle nested "installed" structure
    credentials = credsData.installed || credsData;
  } catch (error) {
    console.error(
      "Error: Could not find google-credentials.json in current directory"
    );
    console.error(
      'Please download your OAuth credentials from Google Cloud and save as "google-credentials.json"'
    );
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    `http://localhost:${PORT}/oauth2callback`
  );

  // Generate auth URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/calendar.readonly"],
  });

  console.log("Opening browser for authorization...\n");

  // Create a simple HTTP server to capture the callback
  const server = http.createServer(async (req, res) => {
    if (req.url.startsWith("/oauth2callback")) {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const code = url.searchParams.get("code");

      if (code) {
        try {
          // Exchange code for tokens
          const { tokens } = await oauth2Client.getToken(code);

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            "<h1>Success!</h1><p>You can close this window. Check your terminal for the refresh token.</p>"
          );

          console.log("\n✓ Authorization successful!\n");
          console.log("Add this to your GitHub secrets as GOOGLE_CALENDAR_CREDS:\n");
          console.log(
            JSON.stringify(
              {
                client_id: credentials.client_id,
                client_secret: credentials.client_secret,
                redirect_uris: credentials.redirect_uris,
                refresh_token: tokens.refresh_token,
              },
              null,
              2
            )
          );

          console.log(
            "\n(Copy the entire JSON above and add it as a secret in GitHub)"
          );

          server.close();
          process.exit(0);
        } catch (error) {
          console.error("Error exchanging code for token:", error.message);
          res.writeHead(400);
          res.end("Error: Could not get token");
          server.close();
          process.exit(1);
        }
      } else {
        res.writeHead(400);
        res.end("Error: No authorization code received");
        server.close();
        process.exit(1);
      }
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.listen(PORT, async () => {
    console.log("Opening browser...");
    await open(authUrl);
    console.log("\nIf browser didn't open, visit this URL:");
    console.log(authUrl);
  });

  // Timeout after 5 minutes
  setTimeout(() => {
    console.error("\nTimeout: Authorization took too long");
    server.close();
    process.exit(1);
  }, 5 * 60 * 1000);
}

setupGoogleCalendarAuth().catch(console.error);
