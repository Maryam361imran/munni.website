importScripts(
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"
);

importScripts(
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "AIzaSyDpot5YRJpW1l6qGWtNl5YE0nhDUENVdzQ",
  authDomain: "college-portal-695c0.firebaseapp.com",
  projectId: "college-portal-695c0",
  storageBucket: "college-portal-695c0.firebasestorage.app",
  messagingSenderId: "557644866574",
  appId: "1:557644866574:web:b6bad6548c60128ffe085f"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || "College Portal";

  const options = {
    body: payload.notification?.body || "You have a new notification.",
    icon: "/favicon.ico",
    data: {
      url: "/"
    }
  };

  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow(event.notification.data?.url || "/")
  );
});