// Downloads a file from the LMS server as the signed-in user.
//
// The session token travels in the Authorization header. It is never put in the address
// (`?token=...`): an address is kept in browser history and written to server logs, and the
// server does not accept a token from there.
export async function downloadWithSession(url, fallbackName = 'download') {
  const token = localStorage.getItem('token');
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) {
    let message = `Download failed (${response.status})`;
    try {
      message = (await response.json()).message || message;
    } catch {
      /* the error was not JSON */
    }
    throw new Error(message);
  }

  const named = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(response.headers.get('Content-Disposition') || '');
  const objectUrl = window.URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = named ? decodeURIComponent(named[1]) : fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60000);
}
