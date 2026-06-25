import os
import requests
from notion_client import Client

# -----------------------
# ENV (from GitHub secrets or local .env)
# -----------------------
JIRA_EMAIL = os.getenv("JIRA_EMAIL")
JIRA_TOKEN = os.getenv("JIRA_TOKEN")
JIRA_BASE_URL = os.getenv("JIRA_BASE_URL")
JIRA_JQL = os.getenv("JIRA_JQL")

NOTION_TOKEN = os.getenv("NOTION_TOKEN")
NOTION_DB = os.getenv("NOTION_DATABASE_ID")
NOTION_NOTES_DB = os.getenv("NOTION_NOTES_DATABASE_ID")

# Validate required env vars
required_vars = [
    "JIRA_EMAIL", "JIRA_TOKEN", "JIRA_BASE_URL", "JIRA_JQL",
    "NOTION_TOKEN", "NOTION_DATABASE_ID", "NOTION_NOTES_DATABASE_ID"
]
missing = [var for var in required_vars if not os.getenv(var)]
if missing:
    raise ValueError(f"Missing environment variables: {', '.join(missing)}")

notion = Client(auth=NOTION_TOKEN)

# -----------------------
# JIRA FETCH
# -----------------------
def fetch_jira_issues():
    url = f"{JIRA_BASE_URL}/rest/api/3/search/jql"
    auth = (JIRA_EMAIL, JIRA_TOKEN)

    print("JQL:", repr(JIRA_JQL))

    params = {
        "jql": JIRA_JQL,
        "maxResults": 50,
        "fields": "summary,status,priority,updated"
    }

    r = requests.get(url, auth=auth, params=params)

    print("STATUS:", r.status_code)
    print("BODY:", r.text[:300])

    r.raise_for_status()

    data = r.json()
    print("RESPONSE KEYS:", list(data.keys()))
    print("TOTAL:", data.get("total"))
    print("ISSUES COUNT:", len(data.get("issues", [])))

    return data.get("issues", [])

# -----------------------
# NOTION UPSERT
# -----------------------
def upsert_notion(issue):
    key = issue["key"]
    fields = issue["fields"]

    title = f"{key} - {fields['summary']}"
    status = fields["status"]["name"]
    priority = fields["priority"]["name"] if fields.get("priority") else "None"
    url = f"{JIRA_BASE_URL}/browse/{key}"

    # search existing page using direct HTTP call
    headers = {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
    }
    query_url = f"https://api.notion.com/v1/databases/{NOTION_DB}/query"
    query_body = {
        "filter": {
            "property": "JIRA Key",
            "rich_text": {"equals": key}
        }
    }
    resp = requests.post(query_url, headers=headers, json=query_body)
    print(f"NOTION QUERY STATUS: {resp.status_code}")
    if resp.status_code != 200:
        print(f"NOTION QUERY ERROR: {resp.text[:300]}")
        resp.raise_for_status()
    existing = resp.json()

    props = {
        "Name": {"title": [{"text": {"content": title}}]},
        "JIRA Key": {"rich_text": [{"text": {"content": key, "link": {"url": url}}}]},
        "Status": {"select": {"name": status}},
        "Priority": {"select": {"name": priority}},
        "URL": {"rich_text": [{"text": {"content": url}}]}
    }

    if existing["results"]:
        page_id = existing["results"][0]["id"]
        notion.pages.update(
            page_id=page_id,
            properties=props
        )
    else:
        notion.pages.create(
            parent={"database_id": NOTION_DB},
            properties=props
        )

# -----------------------
# NOTION NOTES
# -----------------------
def ensure_notes_page(issue):
    key = issue["key"]
    title = f"{key} - Notes"
    url = f"{JIRA_BASE_URL}/browse/{key}"

    # check if notes page already exists
    headers = {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
    }
    query_url = f"https://api.notion.com/v1/databases/{NOTION_NOTES_DB}/query"
    query_body = {
        "filter": {
            "property": "Jira Key",
            "rich_text": {"equals": key}
        }
    }
    resp = requests.post(query_url, headers=headers, json=query_body)
    if resp.status_code != 200:
        print(f"NOTES QUERY ERROR: {resp.text[:300]}")
        resp.raise_for_status()
    existing = resp.json()

    if existing["results"]:
        return

    notion.pages.create(
        parent={"database_id": NOTION_NOTES_DB},
        properties={
            "Ticket": {"title": [{"text": {"content": title}}]},
            "Jira Key": {"rich_text": [{"text": {"content": key, "link": {"url": url}}}]},
        },
        children=[
            {
                "object": "block",
                "type": "paragraph",
                "paragraph": {"rich_text": [{"text": {"content": "## Testing Notes"}}]}
            },
            {
                "object": "block",
                "type": "paragraph",
                "paragraph": {"rich_text": [{"text": {"content": "Repro steps: "}}]}
            },
            {
                "object": "block",
                "type": "paragraph",
                "paragraph": {"rich_text": [{"text": {"content": "Observations: "}}]}
            }
        ]
    )

# -----------------------
# NOTION CLEANUP
# -----------------------
def remove_stale_pages(jira_keys):
    """Remove pages from Notion DB that no longer match the JIRA filter."""
    headers = {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json"
    }

    # Get all pages in the Notion DB
    all_pages = []
    has_more = True
    start_cursor = None

    while has_more:
        body = {}
        if start_cursor:
            body["start_cursor"] = start_cursor

        resp = requests.post(
            f"https://api.notion.com/v1/databases/{NOTION_DB}/query",
            headers=headers,
            json=body
        )
        if resp.status_code != 200:
            print(f"CLEANUP QUERY ERROR: {resp.text[:300]}")
            return
        data = resp.json()
        all_pages.extend(data.get("results", []))
        has_more = data.get("has_more", False)
        start_cursor = data.get("next_cursor")

    # Archive pages whose JIRA key is no longer in the filter results
    removed = 0
    for page in all_pages:
        jira_key_prop = page.get("properties", {}).get("JIRA Key", {})
        rich_text = jira_key_prop.get("rich_text", [])
        if rich_text:
            page_key = rich_text[0].get("plain_text", "")
            if page_key and page_key not in jira_keys:
                notion.pages.update(page_id=page["id"], archived=True)
                print(f"  Archived: {page_key}")
                removed += 1

    if removed:
        print(f"Removed {removed} stale issues from Notion")

# -----------------------
# RUN SYNC
# -----------------------
def run():
    print("Starting JIRA-Notion sync...")
    issues = fetch_jira_issues()
    for issue in issues:
        upsert_notion(issue)
        ensure_notes_page(issue)

    # Remove pages that are no longer in the JIRA filter
    active_keys = {issue["key"] for issue in issues}
    remove_stale_pages(active_keys)

    print(f"Synced {len(issues)} issues")

if __name__ == "__main__":
    run()
