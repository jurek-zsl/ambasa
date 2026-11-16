self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Ambasa", {
      body: data.body || "Your agent has an update.",
      icon: "/icon.svg",
      data: { url: data.url || "/app" },
      tag: data.url || "ambasa",
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    event.notification.data?.url || "/app",
    self.location.origin,
  );
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windows) => {
        const win = windows.find(
          (w) => new URL(w.url).origin === target.origin,
        );
        if (win) {
          await win.navigate(target.href);
          return win.focus();
        }
        return clients.openWindow(target.href);
      }),
  );
});
