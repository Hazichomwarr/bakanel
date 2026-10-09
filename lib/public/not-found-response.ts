/**
 * Static 404 document served by the proxy before a request reaches the `[locale]` root layout.
 * The copy is fixed: nothing from the request is echoed, and no database or session is read.
 * Styles are inline because the response is sent without the application's stylesheet.
 */
const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>404 — Page Not Found | W'BAKENEL Consulting Institute</title>
<style>
body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; background: #f4f2ed; color: #18211d; font-family: Arial, Helvetica, sans-serif; }
header { border-bottom: 1px solid #c8cac0; background: #fbfaf7; padding: 20px; font-family: ui-monospace, Menlo, monospace; font-weight: 600; font-size: 18px; }
main { flex: 1; padding: 96px 20px; max-width: 72rem; width: 100%; box-sizing: border-box; margin: 0 auto; }
h1 { font-family: Georgia, "Times New Roman", serif; font-weight: 500; font-size: clamp(2.5rem, 8vw, 3.75rem); line-height: 1.1; margin: 0; }
p { max-width: 42rem; margin: 24px 0 0; font-size: 18px; line-height: 1.75; color: #4f554f; }
a.home { display: inline-block; margin-top: 40px; background: #15382f; color: #fff; padding: 14px 20px; font-weight: 600; text-decoration: none; }
a.home:hover { background: #245b49; }
a.home:focus-visible { outline: 2px solid #245b49; outline-offset: 3px; }
footer { background: #15382f; color: #fff; padding: 32px 20px; font-size: 14px; }
</style>
</head>
<body>
<header>W'BAKENEL</header>
<main>
<h1>404 — Page Not Found</h1>
<p>Sorry, the page you're looking for doesn't exist or may have been moved.</p>
<a class="home" href="/fr">Return to Homepage</a>
</main>
<footer>W'BAKENEL Consulting Institute</footer>
</body>
</html>
`;

export function notFoundResponse() {
  return new Response(NOT_FOUND_HTML, {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
