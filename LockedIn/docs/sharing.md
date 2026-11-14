# Sharing LockedIn from your Mac

LockedIn uses one browser-facing origin. The Next.js server on port `3001`
proxies `/api` to the Fastify API on port `8000`, so the API and database do
not need to be exposed directly.

## Quick internet sharing with ngrok

1. Start PostgreSQL, the web server, and the API as usual.
2. Start the tunnel:

   ```sh
   ngrok http 3001
   ```

3. Copy the HTTPS forwarding URL printed by ngrok.
4. Restart the API with that URL as both the app origin and Better Auth URL:

   ```sh
   APP_URL="https://your-url.ngrok-free.app" \
   BETTER_AUTH_URL="https://your-url.ngrok-free.app" \
   npm run dev
   ```

   Run that command from `LockedIn/services`.

Share only the HTTPS ngrok URL. The link works while the Mac, web server, API,
PostgreSQL, and ngrok process remain running. Free ngrok URLs can change after
the tunnel restarts, so restart the API with the new URL each time.

## Nginx for permanent hosting

Nginx is appropriate when LockedIn is deployed to a public VPS or server with
a domain. Configure it to forward all traffic to the Next.js service on port
`3001`; Next.js will continue proxying `/api` internally. Use HTTPS and set
`APP_URL` and `BETTER_AUTH_URL` to the permanent public domain.
