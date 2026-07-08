import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const root = process.cwd();
const checks = [];

function pass(message) {
  checks.push({ ok: true, message });
}

function fail(message) {
  checks.push({ ok: false, message });
}

function assert(condition, message) {
  if (condition) {
    pass(message);
  } else {
    fail(message);
  }
}

async function main() {
  const htmlPath = join(root, "index.html");
  const heroPath = join(root, "assets", "ios-reminders-hero.png");

  assert(existsSync(htmlPath), "index.html exists");
  assert(existsSync(heroPath), "hero image exists");

  const html = await readFile(htmlPath, "utf8");

  assert(html.includes('<meta name="viewport"'), "viewport meta tag exists");
  assert(html.includes('id="task-form"'), "task form exists");
  assert(html.includes('id="task-input"'), "task input exists");
  assert(html.includes('id="location-input"'), "location input exists");
  assert(html.includes('id="reminder-input"'), "reminder input exists");
  assert(html.includes('id="active-task-list"'), "active task list exists");
  assert(html.includes('id="completed-task-list"'), "completed task list exists");
  assert(html.includes("localStorage"), "localStorage persistence is present");
  assert(html.includes("task.location"), "task location rendering is present");
  assert(html.includes("overflow-wrap: anywhere"), "long text wrapping is configured");

  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  assert(scripts.length > 0, "inline script exists");

  scripts.forEach((script, index) => {
    try {
      new Function(script);
      pass(`inline script ${index + 1} parses`);
    } catch (error) {
      fail(`inline script ${index + 1} has syntax error: ${error.message}`);
    }
  });

  const server = createStaticServer(root);
  const { port } = await listen(server);

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const page = await fetch(`${baseUrl}/`);
    assert(page.ok, "local server returns index page");
    assert((await page.text()).includes("待办提醒"), "served page contains app title");

    const hero = await fetch(`${baseUrl}/assets/ios-reminders-hero.png`);
    assert(hero.ok, "local server returns hero image");
  } finally {
    await close(server);
  }

  for (const check of checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.message}`);
  }

  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function createStaticServer(baseDir) {
  const contentTypes = new Map([
    [".html", "text/html; charset=utf-8"],
    [".png", "image/png"],
    [".css", "text/css; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
  ]);

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
      const filePath = resolve(baseDir, `.${normalize(pathname)}`);

      if (!filePath.startsWith(resolve(baseDir))) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const body = await readFile(filePath);
      response.writeHead(200, {
        "content-type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });
}

function listen(server) {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolveListen({ port: address.port });
    });
  });
}

function close(server) {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
