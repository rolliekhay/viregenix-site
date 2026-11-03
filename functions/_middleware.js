// Sends anyone who opens the old viregenix-site.pages.dev address to the real domain.
// Example: viregenix-site.pages.dev/admin  ->  https://www.viregenix.com/admin
// Requests on viregenix.com / www.viregenix.com pass straight through, untouched.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === 'viregenix-site.pages.dev') {
    return Response.redirect('https://www.viregenix.com' + url.pathname + url.search, 308);
  }
  return context.next();
}
