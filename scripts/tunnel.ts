/**
 * Share the local dev server over a public HTTPS URL (ngrok), so the site
 * can be tested on phones, tablets and other machines while it keeps
 * running on this computer.
 *
 *   npm run dev              # terminal 1: the site on http://localhost:3000
 *   npm run tunnel           # terminal 2: prints the public https://… URL
 *   npm run tunnel -- 3100   # tunnel another port (e.g. `next start -p 3100`)
 *
 * Requires NGROK_AUTHTOKEN in .env.local (free account:
 * https://dashboard.ngrok.com/get-started/your-authtoken). Optionally set
 * NGROK_DOMAIN to your free static domain so the URL never changes.
 * Ctrl+C closes the tunnel; nothing stays exposed after that.
 */
import ngrok from "@ngrok/ngrok";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* optional */
  }
}

const port = Number(process.argv[2] ?? process.env.PORT ?? 3000);

async function main() {
  if (!process.env.NGROK_AUTHTOKEN) {
    console.error(
      [
        "✖  NGROK_AUTHTOKEN is not set.",
        "   1. Sign up (free) and copy your token: https://dashboard.ngrok.com/get-started/your-authtoken",
        "   2. Add it to .env.local:  NGROK_AUTHTOKEN=your-token",
        "   3. Run `npm run tunnel` again.",
      ].join("\n"),
    );
    process.exit(1);
  }

  const reachable = await fetch(`http://localhost:${port}/`, { method: "HEAD" }).then(
    () => true,
    () => false,
  );
  if (!reachable) {
    console.error(`✖  Nothing is running on http://localhost:${port}. Start it first (npm run dev).`);
    process.exit(1);
  }

  const listener = await ngrok.forward({
    addr: port,
    authtoken_from_env: true,
    domain: process.env.NGROK_DOMAIN?.trim() || undefined,
  });

  console.log(`\n✔  http://localhost:${port} is live at:\n\n   ${listener.url()}\n`);
  console.log("   Open it on any device. Free ngrok URLs show a one-time 'Visit Site' notice first.");
  console.log("   Press Ctrl+C to close the tunnel.\n");

  const close = async () => {
    await ngrok.disconnect().catch(() => {});
    console.log("\n✔  Tunnel closed.");
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
  // Keep the process alive while the tunnel is open.
  process.stdin.resume();
}

main().catch((error) => {
  console.error("✖  Could not open the tunnel:", error instanceof Error ? error.message : error);
  process.exit(1);
});
