import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function test() {
  try {
    const response = await notion.users.me();
    console.log("Token is valid! User:", response);
  } catch (error) {
    console.error("Token error:", error.message);
  }
}

test();
