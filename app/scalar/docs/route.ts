// @/app/scalar/docs/route.ts
import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";

export const GET = async (request: NextRequest) => {
  // Hide Scalar docs in production
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return new Response(
    `<!DOCTYPE html>
<html>
  <head>
    <title>Grooma API Documentation</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@scalar/themes@latest/style.css" />
    <style>
      body {
        margin: 0;
        padding: 0;
      }
    </style>
  </head>
  <body>
    <script
      id="api-reference"
      data-url="/api/openapi.json"
      src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@latest/dist/index.js">
    </script>
  </body>
</html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
};
