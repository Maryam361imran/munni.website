(() => {
  "use strict";

  // ==========================================
  // 1. BASIC SETUP
  // ==========================================

  const $ = id => document.getElementById(id);

  let auth = null;
  let db = null;
  let currentUser = null;
  let messaging = null;

  const VAPID_KEY = "BP0aJQ1jO2OGhz5HYNQLxax81l2o4JJgyi9SsNeRlcrRTKx5l3OYgC5aOIWvJKoPS9khG73xLbwvqI0IB0VQBbo";

  let currentRole = "student";
  let authMode = "login";
  let toastTimer = null;

  let unsubscribeStudentAttendance = null;
  let unsubscribeAdminComplaints = null;
  let allComplaintsUnsubscribe = null;
  let notificationsUnsubscribe = null;
  let updateNotificationsUnsubscribe = null;
  let attendanceWindowTimer = null;

  let currentAttendanceSessionId = null;
  let attendanceSessions = [];

  let editingFacultyId = null;
  let editingLectureId = null;
  let editingNoticeId = null;

  let attendanceEventsInitialized = false;
  let complaintsEventsInitialized = false;

  const esc = value =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  const serverTime = () =>
    firebase.firestore.FieldValue.serverTimestamp();

  function on(id, event, callback) {
    const element = $(id);
    if (element) element.addEventListener(event, callback);
  }

  function showToast(message) {
    const el = $("toast");

    if (!el) {
      console.log(message);
      return;
    }

    el.textContent = message;
    el.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      el.classList.remove("show");
    }, 3500);
  }

  function setStatus(id, message, good = false) {
    const el = $(id);
    if (!el) return;

    el.textContent = message;
    el.style.color = good ? "#2f7c5e" : "#b54747";
  }

  function friendlyError(error) {
    console.error("Firebase/application error:", error);

    const messages = {
      "auth/email-already-in-use":
        "This email already has an account. Please sign in.",

      "auth/invalid-email":
        "Please enter a valid email address.",

      "auth/weak-password":
        "Password must contain at least 6 characters.",

      "auth/invalid-credential":
        "Email or password is incorrect.",

      "auth/user-not-found":
        "No account found with this email.",

      "auth/wrong-password":
        "Incorrect password.",

      "auth/network-request-failed":
        "Network error. Please check your internet connection.",

      "auth/operation-not-allowed":
        "Email/password sign-in is not enabled in Firebase Authentication.",

      "permission-denied":
        "Access denied. Please check your Firestore Rules.",

      "unavailable":
        "Firebase is temporarily unavailable. Please try again."
    };

    return messages[error?.code] ||
      error?.message ||
      "Something went wrong. Please try again.";
  }

  function isAdmin() {
    return Boolean(
      currentUser &&
      currentRole === "admin"
    );
  }

  // ==========================================
  // 2. BROWSER NOTIFICATION DISPLAY
  // ==========================================

  async function showBrowserNotification(title, body) {
    try {
      if (!("Notification" in window)) {
        console.warn("Browser notifications are not supported.");
        return;
      }

      if (Notification.permission !== "granted") {
        console.warn("Notification permission has not been granted.");
        return;
      }

      if (!("serviceWorker" in navigator)) {
        new Notification(title, { body });
        return;
      }

      const registration = await navigator.serviceWorker.ready;

      await registration.showNotification(title, {
        body,
        icon: "./favicon.ico",
        badge: "./favicon.ico",
        tag: "college-" + Date.now(),
        requireInteraction: true
      });

    } catch (error) {
      console.error("Desktop notification error:", error);
      showToast("Could not display desktop notification.");
    }
  }

  // ==========================================
  // 3. FIREBASE INITIALIZATION
  // ==========================================

  function initializeFirebase() {
    const config = window.FIREBASE_CONFIG;

    if (
      typeof firebase === "undefined" ||
      !config ||
      !config.apiKey ||
      !config.projectId
    ) {
      console.error("Firebase SDK or configuration is missing.");

      showToast("Firebase configuration is missing.");

      setStatus(
        "authMessage",
        "Firebase is not configured. Check firebase-config.js."
      );

      return;
    }

    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }

      auth = firebase.auth();
      db = firebase.firestore();

      // if (firebase.messaging && firebase.messaging.isSupported) {
      //   messaging = firebase.messaging.isSupported()
      //     .then(supported => supported ? firebase.messaging() : null)
      //     .catch(() => null);
      // }
async function initializeMessaging() {
  try {
    if (
      !firebase.messaging ||
      typeof firebase.messaging.isSupported !== "function"
    ) {
      messaging = null;
      return;
    }

    const supported = await firebase.messaging.isSupported();

    if (supported) {
      messaging = firebase.messaging();
    } else {
      messaging = null;
      console.warn("Firebase Messaging is not supported in this browser.");
    }

  } catch (error) {
    messaging = null;
    console.error("Messaging initialization error:", error);
  }
}
initializeMessaging();
      auth.onAuthStateChanged(async user => {
        if (user) {
          await handleSignedIn(user);
        } else {
          renderSignedOut();
        }
      });

      loadPublicData();

    } catch (error) {
      console.error("Firebase initialization:", error);
      showToast(friendlyError(error));
    }
  }

  // ==========================================
  // 4. ENABLE PUSH NOTIFICATIONS
  // ==========================================

  async function enablePushNotifications() {
    try {
      if (!currentUser) {
        showToast("Please sign in first.");
        openAuth();
        return;
      }

      if (
        !("Notification" in window) ||
        !("serviceWorker" in navigator)
      ) {
        showToast("Your browser does not support notifications.");
        return;
      }

      if (!messaging) {
        showToast("Firebase Messaging is not available in this browser.");
        return;
      }

      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        showToast("Notification permission was not granted.");
        return;
      }

      const registration = await navigator.serviceWorker.register(
        "./firebase-messaging-sw.js"
      );
await navigator.serviceWorker.ready;
      const messagingInstance = await messaging;

      if (!messagingInstance) {
        showToast("Firebase Messaging is not supported.");
        return;
      }

      const token = await messagingInstance.getToken({
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration
      });

      if (!token) {
        showToast("Could not generate notification token.");
        return;
      }

      const tokenRef = db.collection("users")
        .doc(currentUser.uid)
        .collection("fcmTokens");

      const existingTokens = await tokenRef
        .where("token", "==", token)
        .get();
if (existingTokens.empty) {
  await tokenRef.add({
    token: token,
    createdAt: serverTime(),
    userAgent: navigator.userAgent
  });
}

      showToast("Notification permission enabled successfully!");

    } catch (error) {
      console.error("Push notification error:", error);
      showToast(error.message || "Could not enable notifications.");
    }
  }

  on("enableNotificationsBtn", "click", enablePushNotifications);

  // ==========================================
  // 5. AUTHENTICATION MODAL
  // ==========================================

  function openAuth(mode = "login") {
    setAuthMode(mode);

    if ($("authModal")) {
      $("authModal").hidden = false;
      document.body.style.overflow = "hidden";
    }
  }

  function closeAuth() {
    if ($("authModal")) {
      $("authModal").hidden = true;
      document.body.style.overflow = "";
    }
  }

  function setAuthMode(mode) {
    authMode = mode;

    if ($("loginTab")) {
      $("loginTab").classList.toggle("active", mode === "login");
    }

    if ($("signupTab")) {
      $("signupTab").classList.toggle("active", mode === "signup");
    }

    if ($("authTitle")) {
      $("authTitle").textContent =
        mode === "login"
          ? "Sign in to your portal."
          : "Create your student account.";
    }

    if ($("nameLabel")) {
      $("nameLabel").hidden = mode !== "signup";
    }

    if ($("authName")) {
      $("authName").hidden = mode !== "signup";
      $("authName").required = mode === "signup";
    }

    if ($("authSubmit")) {
      $("authSubmit").textContent =
        mode === "login"
          ? "Sign in →"
          : "Create account →";
    }

    setStatus("authMessage", "");
  }

  on("openAuth", "click", async () => {
    if (!auth) {
      showToast("Firebase is not connected.");
      return;
    }

    if (currentUser) {
      try {
        await auth.signOut();
        showToast("You have signed out.");
      } catch (error) {
        showToast(friendlyError(error));
      }
    } else {
      openAuth("login");
    }
  });

  on("closeAuth", "click", closeAuth);

  on("authModal", "click", event => {
    if (event.target === $("authModal")) {
      closeAuth();
    }
  });

  on("loginTab", "click", () => setAuthMode("login"));
  on("signupTab", "click", () => setAuthMode("signup"));

  on("authForm", "submit", async event => {
    event.preventDefault();

    if (!auth || !db) {
      setStatus(
        "authMessage",
        "Firebase is not connected. Please check the configuration."
      );
      return;
    }

    const email = $("authEmail")?.value.trim().toLowerCase();
    const password = $("authPassword")?.value || "";
    const submit = $("authSubmit");

    if (!email || !password) {
      setStatus(
        "authMessage",
        "Please enter your email and password."
      );
      return;
    }

    if (submit) submit.disabled = true;

    try {
      if (authMode === "signup") {
        const name = $("authName")?.value.trim();

        if (!name) {
          throw new Error("Please enter your full name.");
        }

        const credential =
          await auth.createUserWithEmailAndPassword(email, password);

        try {
          await db.collection("users")
            .doc(credential.user.uid)
            .set({
              name,
              email,
              role: "student",
              createdAt: serverTime()
            });

        } catch (profileError) {
          await auth.signOut();
          throw profileError;
        }

        setStatus(
          "authMessage",
          "Your student account has been created successfully.",
          true
        );

        showToast("Student account created.");

      } else {
        await auth.signInWithEmailAndPassword(email, password);

        setStatus("authMessage", "Signed in successfully.", true);
        showToast("Sign-in successful.");
      }

      setTimeout(closeAuth, 600);

    } catch (error) {
      setStatus("authMessage", friendlyError(error));

    } finally {
      if (submit) submit.disabled = false;
    }
  });

  // ==========================================
  // 6. SIGNED IN / SIGNED OUT
  // ==========================================

  async function handleSignedIn(user) {
    if (!db) return;

    try {
      const profileRef = db.collection("users").doc(user.uid);
      const profileSnapshot = await profileRef.get();

      let profile;

      if (!profileSnapshot.exists) {
        profile = {
          name: user.displayName || "",
          email: user.email || "",
          role: "student"
        };

        await profileRef.set({
          ...profile,
          createdAt: serverTime()
        });

      } else {
        profile = profileSnapshot.data();
      }

      renderSignedIn(user, profile);

    } catch (error) {
      console.error("Profile loading error:", error);

      setStatus(
        "authMessage",
        "Your account signed in, but its profile could not be loaded. Check Firestore Rules."
      );

      showToast(friendlyError(error));
    }
  }

  function renderSignedIn(user, profile) {
    currentUser = user;

    currentRole =
      profile?.role === "admin" ? "admin" : "student";

    console.log("Signed-in UID:", user.uid);
    console.log("Current role:", currentRole);

    if ($("openAuth")) {
      $("openAuth").textContent = "Sign out ↗";
    }

    if ($("adminPanel")) {
      $("adminPanel").hidden = currentRole !== "admin";
    }

    if ($("studentComplaintsPanel")) {
      $("studentComplaintsPanel").hidden = true;
    }

    setStatus("complaintMessageStatus", "");

    showToast(
      "Welcome" +
      (profile?.name ? ", " + profile.name : "") +
      "!"
    );

    loadNotifications();
    loadTopNotifications();
    loadUpdateNotifications();
setTimeout(showNotificationPrompt, 1000);

    if (currentRole === "student") {
      loadStudentAttendance(user);
    } else {
      stopStudentAttendance();
      loadAdminComplaints();
      loadAdminAttendance();
    }
  }

  function stopStudentAttendance() {
    if (unsubscribeStudentAttendance) {
      unsubscribeStudentAttendance();
      unsubscribeStudentAttendance = null;
    }
  }

  function stopAdminComplaints() {
    if (unsubscribeAdminComplaints) {
      unsubscribeAdminComplaints();
      unsubscribeAdminComplaints = null;
    }
  }

  function stopAllComplaints() {
    if (allComplaintsUnsubscribe) {
      allComplaintsUnsubscribe();
      allComplaintsUnsubscribe = null;
    }
  }

  function renderSignedOut() {
    currentUser = null;
    currentRole = "student";

    stopStudentAttendance();
    stopAdminComplaints();
    stopAllComplaints();

    if (updateNotificationsUnsubscribe) {
      updateNotificationsUnsubscribe();
      updateNotificationsUnsubscribe = null;
    }

    if ($("openAuth")) {
      $("openAuth").textContent = "Sign in ↗";
    }

    if ($("adminPanel")) {
      $("adminPanel").hidden = true;
    }

    if ($("studentComplaintsPanel")) {
      $("studentComplaintsPanel").hidden = true;
    }

    if ($("adminComplaints")) {
      $("adminComplaints").textContent =
        "Sign in as administrator to manage complaints.";
    }

    if ($("studentComplaints")) {
      $("studentComplaints").textContent =
        "Sign in to view complaints.";
    }

    if ($("studentAttendanceList")) {
      $("studentAttendanceList").textContent =
        "Sign in to view your attendance.";
    }

    currentAttendanceSessionId = null;
    updateAttendanceWindow();
  }

  // ==========================================
  // 7. NAVIGATION AND THEME
  // ==========================================

  on("attendanceAction", "click", () => {
    if (!currentUser) {
      openAuth();
      return;
    }

    const target =
      currentRole === "admin"
        ? $("adminPanel")
        : $("attendance");

    target?.scrollIntoView({ behavior: "smooth" });
  });

  on("menuToggle", "click", () => {
    $("navLinks")?.classList.toggle("open");
  });

  document.querySelectorAll("#navLinks a").forEach(link => {
    link.addEventListener("click", () => {
      $("navLinks")?.classList.remove("open");
    });
  });

  on("themeToggle", "click", () => {
    document.body.classList.toggle("dark");

    localStorage.setItem(
      "collegeTheme",
      document.body.classList.contains("dark") ? "dark" : "light"
    );
  });

  if (localStorage.getItem("collegeTheme") === "dark") {
    document.body.classList.add("dark");
  }

  if ($("year")) {
    $("year").textContent = new Date().getFullYear();
  }

  // ==========================================
  // 8. SEPARATE UPDATE NOTIFICATION HELPER
  // ==========================================
async function createUpdateNotification(title, body, targetUid = null) {
  if (!db || !isAdmin() || !currentUser) return;

  const notification = {
    title,
    body,
    type: "Update",
    createdBy: currentUser.uid,
    createdAt: serverTime()
  };

 if (targetUid) {
  await db.collection("users")
    .doc(targetUid)
    .collection("notifications")
    .add(notification);
} else {
  await db.collection("updateNotifications")
    .add(notification);

  await sendOneSignalPush(title, body);
}
}

  // ==========================================
  // 9. CAMPUS NOTICE LISTENER
  // ==========================================

  function loadNotifications() {
    if (!db) return;

    if (notificationsUnsubscribe) {
      notificationsUnsubscribe();
      notificationsUnsubscribe = null;
    }

    notificationsUnsubscribe = db
      .collection("notifications")
      .orderBy("createdAt", "desc")
      .onSnapshot(snapshot => {
        const list = $("noticeList");
        if (!list) return;

        const visibleNotices = [];

        snapshot.forEach(doc => {
          const item = doc.data();

          if (
            item.targetUid &&
            (!currentUser || item.targetUid !== currentUser.uid)
          ) {
            return;
          }

          visibleNotices.push({
            id: doc.id,
            ...item
          });
        });

        list.innerHTML = "";

        if (!visibleNotices.length) {
          list.innerHTML =
            '<div class="empty-card">No campus notices available.</div>';

        } else {
          visibleNotices.forEach(item => {
            const card = document.createElement("article");
            card.className = "notice-card";

            card.innerHTML = `
              <div class="notice-meta">
                <span class="notice-type">${esc(item.type || "General")}</span>
                <time>Campus notice</time>
              </div>

              <h3>${esc(item.title || "Campus Notice")}</h3>
              <p>${esc(item.body || "")}</p>

              ${
                isAdmin()
                  ? `
                    <div class="admin-actions">
                      <button type="button"
                        data-notice-edit="${esc(item.id)}">Edit</button>

                      <button type="button"
                        data-notice-delete="${esc(item.id)}">Delete</button>
                    </div>
                  `
                  : ""
              }
            `;

            list.appendChild(card);
          });
        }

      }, error => {
        console.error("Campus notices:", error);
        showToast(friendlyError(error));
      });
  }

  let topNotificationUnsubscribe = null;
let firstTopNotificationSnapshot = true;

function showTopNotification(title, body) {
  const banner = $("topNotificationBanner");

  if (!banner) return;

  $("topNotificationTitle").textContent = title;
  $("topNotificationBody").textContent = body;

  banner.hidden = false;
}

on("closeTopNotification", "click", () => {
  $("topNotificationBanner").hidden = true;
});

function loadTopNotifications() {
  if (!currentUser || !db) return;

  if (topNotificationUnsubscribe) {
    topNotificationUnsubscribe();
  }

  firstTopNotificationSnapshot = true;

  topNotificationUnsubscribe = db
    .collection("notifications")
    .orderBy("createdAt", "desc")
    .onSnapshot(snapshot => {

      if (firstTopNotificationSnapshot) {
        firstTopNotificationSnapshot = false;
        return;
      }

      snapshot.docChanges().forEach(change => {
        if (change.type !== "added") return;

        const data = change.doc.data();

        if (data.targetUid && data.targetUid !== currentUser.uid) {
          return;
        }

        showTopNotification(data.title || "New Notification", data.body || "");
      });

    }, error => {
      console.error("Top notification error:", error);
    });
}
  async function sendOneSignalPush(title, body) {
  try {
    if (!currentUser) return;

    const idToken = await currentUser.getIdToken();

    const response = await fetch(
      "https://college-notifications.maryam361imran.workers.dev/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({ title, body })
      }
    );

    if (!response.ok) {
      console.error("Push notification failed:", await response.text());
    }

  } catch (error) {
    console.error("Push notification error:", error);
  }
}
// ==========================================
// CAMPUS NOTICE EDIT / DELETE BUTTONS
// ==========================================

on("noticeList", "click", async event => {
  const editButton = event.target.closest("[data-notice-edit]");
  const deleteButton = event.target.closest("[data-notice-delete]");

  if (!isAdmin()) return;

  try {
    if (editButton) {
      const id = editButton.dataset.noticeEdit;

      const doc = await db
        .collection("notifications")
        .doc(id)
        .get();

      if (!doc.exists) {
        showToast("Notice not found.");
        return;
      }

      const data = doc.data();

      editingNoticeId = id;

      $("noticeTitle").value = data.title || "";
      $("noticeType").value = data.type || "";
      $("noticeBody").value = data.body || "";

      $("noticeForm").querySelector("h3").textContent =
        "Edit campus notice";

      $("noticeForm")
        .querySelector('button[type="submit"]')
        .textContent = "Save changes";

      $("noticeForm").scrollIntoView({
        behavior: "smooth"
      });

    } else if (deleteButton) {
      const id = deleteButton.dataset.noticeDelete;

      if (!confirm("Are you sure you want to delete this notice?")) {
        return;
      }

      await db.collection("notifications").doc(id).delete();

      await createUpdateNotification(
        "Campus Notice Deleted",
        "The college administration has removed a campus notice."
      );

      showToast("Campus notice deleted successfully.");
    }

  } catch (error) {
    console.error("Notice action error:", error);
    showToast(friendlyError(error));
  }
});


  
  
  // ==========================================
  // 10. UPDATE NOTIFICATION LISTENER
  // ==========================================
function loadUpdateNotifications() {
  if (!db || !currentUser) return;

  if (updateNotificationsUnsubscribe) {
    updateNotificationsUnsubscribe();
    updateNotificationsUnsubscribe = null;
  }

  let firstGlobalLoad = true;
  let firstPersonalLoad = true;

  const globalUnsubscribe = db
    .collection("updateNotifications")
    .orderBy("createdAt", "desc")
    .onSnapshot(snapshot => {

      if (firstGlobalLoad) {
        firstGlobalLoad = false;
        return;
      }

      snapshot.docChanges().forEach(change => {
        if (change.type !== "added") return;

        const item = change.doc.data();

        if (item.createdBy === currentUser.uid) return;

        showBrowserNotification(
          item.title || "College Update",
          item.body || "The college administration has made an update."
        );
      });

    }, error => {
      console.error("Global notification listener:", error);
    });

  const personalUnsubscribe = db
    .collection("users")
    .doc(currentUser.uid)
    .collection("notifications")
    .orderBy("createdAt", "desc")
    .onSnapshot(snapshot => {

      if (firstPersonalLoad) {
        firstPersonalLoad = false;
        return;
      }

      snapshot.docChanges().forEach(change => {
        if (change.type !== "added") return;

        const item = change.doc.data();

        showBrowserNotification(
          item.title || "College Update",
          item.body || "You have a new personal update."
        );
      });

    }, error => {
      console.error("Personal notification listener:", error);
    });

  updateNotificationsUnsubscribe = () => {
    globalUnsubscribe();
    personalUnsubscribe();
  };
}

  // ==========================================
  // PART 1 ENDS HERE



    // ==========================================
  // 11. FACULTY MANAGEMENT
  // ==========================================

  async function loadFaculty() {
    if (!db) return;

    const grid = $("facultyGrid");
    if (!grid) return;

    try {
      const snapshot = await db.collection("faculty").get();

      grid.innerHTML = "";

      if (snapshot.empty) {
        grid.innerHTML =
          '<div class="empty-card">No faculty records added yet.</div>';

        setStatus("facultyStatus", "No faculty records found.", true);
        return;
      }

      snapshot.forEach(doc => {
        const data = doc.data();
        const card = document.createElement("div");

        card.className = "faculty-card";

        card.innerHTML = `
          <div class="faculty-avatar">
            ${esc((data.name || "T").charAt(0).toUpperCase())}
          </div>

          <h3>${esc(data.name)}</h3>
          <p>${esc(data.subject)}</p>
          <small>${esc(data.designation)}</small>

          ${
            isAdmin()
              ? `
                <div class="admin-actions">
                  <button type="button"
                    class="btn btn-small"
                    data-faculty-edit="${esc(doc.id)}">
                    Edit
                  </button>

                  <button type="button"
                    class="btn btn-small"
                    data-faculty-delete="${esc(doc.id)}">
                    Delete
                  </button>
                </div>
              `
              : ""
          }
        `;

        grid.appendChild(card);
      });

      setStatus(
        "facultyStatus",
        `${snapshot.size} faculty record(s)`,
        true
      );

      const search = $("facultySearch")?.value.trim().toLowerCase();

      if (search) {
        document.querySelectorAll(".faculty-card").forEach(card => {
          card.hidden =
            !card.textContent.toLowerCase().includes(search);
        });
      }

    } catch (error) {
      console.error("Faculty loading:", error);
      setStatus("facultyStatus", friendlyError(error));
    }
  }

  on("facultyGrid", "click", async event => {
    const editButton = event.target.closest("[data-faculty-edit]");
    const deleteButton = event.target.closest("[data-faculty-delete]");

    if (!isAdmin()) return;

    try {
      if (editButton) {
        const id = editButton.dataset.facultyEdit;
        const doc = await db.collection("faculty").doc(id).get();

        if (!doc.exists) return;

        const data = doc.data();

        editingFacultyId = id;

        $("facultyName").value = data.name || "";
        $("facultySubject").value = data.subject || "";
        $("facultyDesignation").value = data.designation || "";

        $("facultyForm").querySelector("h3").textContent = "Edit faculty";

        $("facultyForm")
          .querySelector('button[type="submit"]')
          .textContent = "Save changes";

        $("facultyForm").scrollIntoView({ behavior: "smooth" });

      } else if (deleteButton) {
        const id = deleteButton.dataset.facultyDelete;

        if (!confirm("Are you sure you want to delete this faculty record?")) {
          return;
        }

        await db.collection("faculty").doc(id).delete();

        await createUpdateNotification(
          "Faculty Deleted",
          "The college administration has removed a faculty record."
        );

        showToast("Faculty deleted successfully.");
        await loadFaculty();
      }

    } catch (error) {
      showToast(friendlyError(error));
    }
  });

  on("facultyForm", "submit", async event => {
    event.preventDefault();

    if (!isAdmin()) {
      showToast("Only the administrator can manage faculty.");
      return;
    }

    try {
      const name = $("facultyName").value.trim();
      const subject = $("facultySubject").value.trim();
      const designation = $("facultyDesignation").value.trim();

      if (!name || !subject || !designation) {
        showToast("Please complete all faculty fields.");
        return;
      }

      if (editingFacultyId) {
        await db.collection("faculty").doc(editingFacultyId).update({
          name,
          subject,
          designation,
          updatedAt: serverTime()
        });

        await createUpdateNotification(
          "Faculty Updated",
          "The college administration has updated faculty information."
        );

        editingFacultyId = null;
        showToast("Faculty updated successfully.");

      } else {
        await db.collection("faculty").add({
          name,
          subject,
          designation,
          createdAt: serverTime(),
          createdBy: currentUser.uid
        });

        await createUpdateNotification(
          "Faculty Added",
          "The college administration has added a new faculty record."
        );

        showToast("Faculty added successfully.");
      }

      $("facultyForm").reset();

      $("facultyForm").querySelector("h3").textContent = "Add faculty";

      $("facultyForm")
        .querySelector('button[type="submit"]')
        .textContent = "Add faculty";

      await loadFaculty();

    } catch (error) {
      showToast(friendlyError(error));
    }
  });

  on("facultySearch", "input", () => {
    const search = $("facultySearch").value.trim().toLowerCase();

    document.querySelectorAll(".faculty-card").forEach(card => {
      card.hidden =
        !card.textContent.toLowerCase().includes(search);
    });
  });

  // ==========================================
  // 12. LECTURE SCHEDULE
  // ==========================================

  async function loadLectures() {
    if (!db) return;

    try {
      const snapshot = await db.collection("lectures").get();

      const body = $("scheduleBody");
      if (!body) return;

      if (snapshot.empty) {
        body.innerHTML = `
          <tr>
            <td colspan="${isAdmin() ? 7 : 6}" class="table-empty">
              No schedule published yet.
            </td>
          </tr>
        `;
        return;
      }

      body.innerHTML = "";

      snapshot.forEach(doc => {
        const item = doc.data();
        const row = document.createElement("tr");

        row.innerHTML = `
          <td>${esc(item.day)}</td>
          <td>${esc(item.time)}</td>
          <td>${esc(item.className)}</td>
          <td>${esc(item.subject)}</td>
          <td>${esc(item.faculty)}</td>
          <td>${esc(item.room)}</td>

          ${
            isAdmin()
              ? `
                <td>
                  <button type="button"
                    data-lecture-edit="${esc(doc.id)}">
                    Edit
                  </button>

                  <button type="button"
                    data-lecture-delete="${esc(doc.id)}">
                    Delete
                  </button>
                </td>
              `
              : ""
          }
        `;

        body.appendChild(row);
      });

    } catch (error) {
      console.error("Lecture loading:", error);
      showToast(friendlyError(error));
    }
  }

  on("scheduleBody", "click", async event => {
    if (!isAdmin()) return;

    const edit = event.target.closest("[data-lecture-edit]");
    const del = event.target.closest("[data-lecture-delete]");

    try {
      if (edit) {
        const id = edit.dataset.lectureEdit;
        const doc = await db.collection("lectures").doc(id).get();

        if (!doc.exists) return;

        const data = doc.data();

        editingLectureId = id;

        $("lectureDay").value = data.day || "";
        $("lectureTime").value = data.time || "";
        $("lectureClass").value = data.className || "";
        $("lectureSubject").value = data.subject || "";
        $("lectureFaculty").value = data.faculty || "";
        $("lectureRoom").value = data.room || "";

        $("scheduleForm").querySelector("h3").textContent =
          "Edit lecture";

        $("scheduleForm")
          .querySelector('button[type="submit"]')
          .textContent = "Save changes";

        $("scheduleForm").scrollIntoView({ behavior: "smooth" });

      } else if (del) {
        const id = del.dataset.lectureDelete;

        if (!confirm("Delete this lecture?")) return;

        await db.collection("lectures").doc(id).delete();

        await createUpdateNotification(
          "Timetable Updated",
          "The college administration has removed a lecture from the timetable."
        );

        showToast("Lecture deleted.");
        await loadLectures();
      }

    } catch (error) {
      showToast(friendlyError(error));
    }
  });

  on("scheduleForm", "submit", async event => {
    event.preventDefault();

    if (!isAdmin()) {
      showToast("Only the administrator can manage the timetable.");
      return;
    }

    try {
      const data = {
        day: $("lectureDay").value,
        time: $("lectureTime").value.trim(),
        className: $("lectureClass").value.trim(),
        subject: $("lectureSubject").value.trim(),
        faculty: $("lectureFaculty").value.trim(),
        room: $("lectureRoom").value.trim()
      };

      if (Object.values(data).some(value => !value)) {
        showToast("Please complete all lecture fields.");
        return;
      }

      if (editingLectureId) {
        await db.collection("lectures").doc(editingLectureId).update({
          ...data,
          updatedAt: serverTime()
        });

        await createUpdateNotification(
          "Timetable Updated",
          "The college administration has updated the lecture schedule."
        );

        editingLectureId = null;
        showToast("Lecture updated successfully.");

      } else {
        await db.collection("lectures").add({
          ...data,
          createdAt: serverTime(),
          createdBy: currentUser.uid
        });

        await createUpdateNotification(
          "Timetable Updated",
          "The college administration has published a new lecture schedule."
        );

        showToast("Lecture published successfully.");
      }

      $("scheduleForm").reset();

      $("scheduleForm").querySelector("h3").textContent = "Add lecture";

      $("scheduleForm")
        .querySelector('button[type="submit"]')
        .textContent = "Publish lecture";

      await loadLectures();

    } catch (error) {
      showToast(friendlyError(error));
    }
  });

  // ==========================================
 
// ==========================================
// 13. CAMPUS NOTICE MANAGEMENT
// ==========================================

on("noticeForm", "submit", async event => {
  event.preventDefault();

  if (!isAdmin()) {
    showToast("Only the administrator can manage campus notices.");
    return;
  }

  try {
    const title = $("noticeTitle").value.trim();
    const type = $("noticeType").value;
    const body = $("noticeBody").value.trim();

    if (!title || !type || !body) {
      showToast("Please complete all notice fields.");
      return;
    }

    if (editingNoticeId) {
      await db.collection("notifications")
        .doc(editingNoticeId)
        .update({
          title,
          type,
          body,
          updatedAt: serverTime()
        });

      await createUpdateNotification(
        "Campus Notice Updated",
        "The college administration has updated a campus notice."
      );

      editingNoticeId = null;

      showToast("Campus notice updated successfully.");

    } else {
      await db.collection("notifications").add({
        title,
        type,
        body,
        createdBy: currentUser.uid,
        createdAt: serverTime()
      });

      await createUpdateNotification(
        "New Campus Notice",
        `${title}: ${body}`
      );

      showToast("Notice published and notification sent successfully.");
    }

    $("noticeForm").reset();

    $("noticeForm").querySelector("h3").textContent =
      "Publish notification";

    $("noticeForm")
      .querySelector('button[type="submit"]')
      .textContent = "Publish notice";

  } catch (error) {
    showToast(friendlyError(error));
  }
});

  // 15. VIEW COMPLAINTS
  // ==========================================

  const viewComplaintsBtn = $("viewComplaintsBtn");
  const closeComplaintsBtn = $("closeComplaintsBtn");
  const complaintsPanel = $("studentComplaintsPanel");
  const complaintsContainer = $("studentComplaints");

  function loadAllComplaints() {
    if (!db || !currentUser || !complaintsContainer) return;

    stopAllComplaints();

    complaintsContainer.innerHTML =
      "<p>Loading complaints...</p>";

    let query = db.collection("complaints");

    if (currentRole !== "admin") {
      query = query.where("uid", "==", currentUser.uid);
    }

    allComplaintsUnsubscribe = query.onSnapshot(snapshot => {
      if (snapshot.empty) {
        complaintsContainer.innerHTML =
          "<p>No complaints have been submitted yet.</p>";

        return;
      }

      const complaints = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      complaints.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;

        return bTime - aTime;
      });

      complaintsContainer.innerHTML = complaints.map(c => {
        const adminControls = currentRole === "admin"
          ? `
            <div class="complaint-admin-actions">
              <textarea
                class="admin-reply-input"
                data-reply-for="${esc(c.id)}"
                placeholder="Write administration reply..."
              >${esc(c.adminReply || "")}</textarea>

              <button type="button"
                data-action="reply"
                data-id="${esc(c.id)}">
                Reply
              </button>

              <button type="button"
                data-action="resolve"
                data-id="${esc(c.id)}">
                Resolve
              </button>

              <button type="button"
                data-action="delete"
                data-id="${esc(c.id)}">
                Delete
              </button>
            </div>
          `
          : "";

        return `
          <div class="admin-complaint">
            <strong>${esc(c.subject || "No subject")}</strong>

            <p>Category: ${esc(c.category || "General")}</p>
            <p>${esc(c.message || "")}</p>

            <p>
              <strong>Status:</strong>
              ${esc(c.status || "Submitted")}
            </p>

            ${
              currentRole === "admin"
                ? `<p><strong>Student:</strong> ${esc(c.email || "")}</p>`
                : ""
            }

            ${
              c.adminReply
                ? `
                  <div class="complaint-reply">
                    <strong>Administration Reply</strong>
                    <p>${esc(c.adminReply)}</p>
                  </div>
                `
                : "<p>No administration reply yet.</p>"
            }

            ${adminControls}
          </div>
        `;
      }).join("");

    }, error => {
      console.error("Complaint loading:", error);

      complaintsContainer.innerHTML =
        "<p>Unable to load complaints. Check Firestore Rules.</p>";
    });
  }

  if (viewComplaintsBtn) {
    viewComplaintsBtn.addEventListener("click", () => {
      if (!currentUser) {
        openAuth();
        showToast("Please sign in first.");
        return;
      }

      if (!complaintsPanel) return;

      complaintsPanel.hidden = false;

      loadAllComplaints();

      setTimeout(() => {
        complaintsPanel.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }, 100);
    });
  }

  if (closeComplaintsBtn) {
    closeComplaintsBtn.addEventListener("click", () => {
      if (complaintsPanel) {
        complaintsPanel.hidden = true;
      }

      stopAllComplaints();
    });
  }

  function loadAdminComplaints() {
    const container = $("adminComplaints");

    if (!container || !db || !isAdmin()) return;

    stopAdminComplaints();

    container.textContent = "Loading complaints...";

    unsubscribeAdminComplaints = db
      .collection("complaints")
      .orderBy("createdAt", "desc")
      .onSnapshot(snapshot => {

        if (snapshot.empty) {
          container.innerHTML = "<p>No complaints found.</p>";
          return;
        }

        container.innerHTML = snapshot.docs.map(doc => {
          const c = doc.data();
          const id = doc.id;

          return `
            <div class="admin-complaint">
              <h4>${esc(c.subject || "No subject")}</h4>

              <p>Category: ${esc(c.category || "General")}</p>
              <p>${esc(c.message || "")}</p>

              <p>
                <strong>Status:</strong>
                ${esc(c.status || "Submitted")}
              </p>

              <p>
                <strong>Student:</strong>
                ${esc(c.email || "")}
              </p>

              <textarea
                data-reply-for="${esc(id)}"
                placeholder="Write administration reply"
              >${esc(c.adminReply || "")}</textarea>

              <button type="button"
                data-action="reply"
                data-id="${esc(id)}">
                Reply
              </button>

              <button type="button"
                data-action="resolve"
                data-id="${esc(id)}">
                Resolve
              </button>

              <button type="button"
                data-action="delete"
                data-id="${esc(id)}">
                Delete
              </button>
            </div>
          `;
        }).join("");

      }, error => {
        console.error("Admin complaints:", error);

        container.innerHTML =
          "<p>Unable to load complaints. Check Firestore Rules.</p>";
      });
  }

  async function handleComplaintAction(event) {
    const button = event.target.closest("button[data-action]");

    if (!button || !isAdmin() || !db) return;

    const id = button.dataset.id;
    const action = button.dataset.action;

    const ref = db.collection("complaints").doc(id);

    try {
      if (action === "reply") {
        const card = button.closest(".admin-complaint");

        const textarea = card?.querySelector("[data-reply-for]");

        const reply = textarea?.value.trim();

        if (!reply) {
          showToast("Please write a reply first.");
          return;
        }

        const complaintSnapshot = await ref.get();

        if (!complaintSnapshot.exists) {
          showToast("Complaint not found.");
          return;
        }

        const complaint = complaintSnapshot.data();

        await ref.update({
          adminReply: reply,
          repliedAt: serverTime(),
          status: "Replied"
        });

        await createUpdateNotification(
          "Administration Reply",
          "The administration has replied to your complaint.",
          complaint.uid || null
        );

        showToast("Reply sent successfully.");

      } else if (action === "resolve") {
        const complaintSnapshot = await ref.get();

        if (!complaintSnapshot.exists) return;

        const complaint = complaintSnapshot.data();

        await ref.update({
          status: "Resolved",
          resolvedAt: serverTime()
        });

        await createUpdateNotification(
          "Complaint Resolved",
          "Your complaint has been marked as resolved.",
          complaint.uid || null
        );

        showToast("Complaint resolved.");

      } else if (action === "delete") {
        if (!confirm("Are you sure you want to delete this complaint?")) {
          return;
        }

        await ref.delete();

        showToast("Complaint deleted.");
      }

    } catch (error) {
      console.error("Complaint action:", error);
      showToast(friendlyError(error));
    }
  }

  if (!complaintsEventsInitialized) {
    complaintsEventsInitialized = true;

    if (complaintsContainer) {
      complaintsContainer.addEventListener(
        "click",
        handleComplaintAction
      );
    }

    if ($("adminComplaints")) {
      $("adminComplaints").addEventListener(
        "click",
        handleComplaintAction
      );
    }
  }

  // ==========================================
  // 16. STUDENT ATTENDANCE DISPLAY
  // ==========================================

  function createAttendanceDisplay() {
    const panel = document.querySelector(".attendance-panel");

    if (!panel || $("studentAttendanceRecords")) return;

    const section = document.createElement("div");

    section.id = "studentAttendanceRecords";
    section.className = "attendance-records";

    section.innerHTML = `
      <hr>
      <h3>My attendance records</h3>

      <div id="studentAttendanceList">
        Sign in to view your attendance.
      </div>
    `;

    panel.appendChild(section);
  }

  function loadStudentAttendance(user) {
    if (!db || !user?.email) return;

    createAttendanceDisplay();
    stopStudentAttendance();

    const list = $("studentAttendanceList");

    if (list) {
      list.textContent = "Loading attendance...";
    }

    unsubscribeStudentAttendance = db
      .collection("attendance")
      .where("studentEmail", "==", user.email.toLowerCase())
      .onSnapshot(snapshot => {

        const attendanceList = $("studentAttendanceList");

        if (!attendanceList) return;

        if (snapshot.empty) {
          attendanceList.innerHTML =
            "<p>No attendance records found yet.</p>";

          return;
        }

        const records = snapshot.docs.map(doc => doc.data());

        records.sort((a, b) =>
          String(b.date || "").localeCompare(String(a.date || ""))
        );

        attendanceList.innerHTML = records.map(item => `
          <div class="admin-complaint">
            <strong>${esc(item.date || "")}</strong>

            <p>Class: ${esc(item.className || "")}</p>
            <p>Section: ${esc(item.section || "")}</p>
            <p>Status: <b>${esc(item.status || "")}</b></p>
          </div>
        `).join("");

      }, error => {
        console.error("Student attendance:", error);
        showToast(friendlyError(error));
      });
  }

on("complaintForm", "submit", async (event) => {
  event.preventDefault();

  if (!currentUser) {
    showToast("Please sign in first.");
    openAuth();
    return;
  }

  if (!db) {
    showToast("Database is not connected.");
    return;
  }

  const category = $("complaintCategory").value;
  const subject = $("complaintSubject").value.trim();
  const message = $("complaintMessage").value.trim();
  const status = $("complaintMessageStatus");

  if (!category || !subject || !message) {
    setStatus(status, "Please complete all fields.");
    return;
  }

  try {
    await db.collection("complaints").add({
      uid: currentUser.uid,
      email: currentUser.email || "",
      category,
      subject,
      message,
      status: "Submitted",
      createdAt: serverTime()
    });

    $("complaintForm").reset();
    setStatus(status, "Complaint submitted successfully!");
    showToast("Complaint submitted successfully.");
  } catch (error) {
    console.error("Complaint submission error:", error);
    setStatus(status, "Unable to submit complaint. Please try again.");
  }
});

  // ==========================================
  // PART 3 ENDS HERE

    // ==========================================
  // 17. PAKISTAN TIME / ATTENDANCE WINDOW
  // ==========================================

  function getPKTParts() {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(new Date());

    const result = {};

    parts.forEach(part => {
      result[part.type] = part.value;
    });

    return result;
  }

  function getPKTDate() {
    const p = getPKTParts();

    return `${p.year}-${p.month}-${p.day}`;
  }

  function isAttendanceTimeOpen() {
    const p = getPKTParts();

    const hour = Number(p.hour);
    const minute = Number(p.minute);

    return hour === 8 && minute <= 40;
  }

  function updateAttendanceWindow() {
    const open = isAttendanceTimeOpen();

    const sessionButton = $("createSessionBtn");
    const markButton = $("markAttendanceBtn");
    const status = $("attendanceWindowStatus");

    if (sessionButton) {
      sessionButton.disabled = !open || !isAdmin();
    }

    if (markButton) {
      markButton.disabled = !open || !isAdmin();
    }

    if (status) {
      if (open) {
        status.textContent =
          "Attendance is OPEN. Sessions and attendance can be managed until 8:40 AM PKT.";

        status.className =
          "attendance-window-status is-open";

      } else {
        status.textContent =
          "Attendance is LOCKED. Available daily from 8:00 AM to 8:40 AM PKT.";

        status.className =
          "attendance-window-status is-locked";
      }
    }
  }

  // ==========================================
  // 18. LOAD TODAY'S ATTENDANCE SESSIONS
  // ==========================================

  async function loadTodayAttendanceSessions() {
    const select = $("attendanceSessionSelect");

    if (!select || !db || !currentUser) return;

    select.innerHTML =
      '<option value="">Loading sessions...</option>';

    try {
      const snapshot = await db
        .collection("attendanceSessions")
        .where("date", "==", getPKTDate())
        .get();

      attendanceSessions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      select.innerHTML =
        '<option value="">Select a created session</option>';

      attendanceSessions.forEach(session => {
        const option = document.createElement("option");

        option.value = session.id;

        option.textContent =
          `${session.className} - Section ${session.section} - ${session.department}`;

        select.appendChild(option);
      });

      const info = $("attendanceSessionInfo");

      if (info && attendanceSessions.length === 0) {
        info.textContent = "No session created today.";
      }

    } catch (error) {
      console.error("Session loading:", error);
      showToast(friendlyError(error));
    }
  }

  // ==========================================
  // 19. ADMIN ATTENDANCE INITIALIZATION
  // ==========================================

  function loadAdminAttendance() {
    if (!$("attendanceSessionForm")) return;

    updateAttendanceWindow();

    if ($("attendanceDate")) {
      $("attendanceDate").value = getPKTDate();
      $("attendanceDate").min = getPKTDate();
      $("attendanceDate").max = getPKTDate();
    }

    loadTodayAttendanceSessions();

    if (attendanceWindowTimer) {
      clearInterval(attendanceWindowTimer);
    }

    attendanceWindowTimer =
      setInterval(updateAttendanceWindow, 10000);

    if (attendanceEventsInitialized) return;

    attendanceEventsInitialized = true;

    on(
      "attendanceSessionForm",
      "submit",
      createAttendanceSession
    );

    on("attendanceSessionSelect", "change", event => {
      const sessionId = event.target.value;

      currentAttendanceSessionId = sessionId || null;

      const form = $("attendanceMarkForm");
      const info = $("attendanceSessionInfo");

      if (!sessionId) {
        if (form) form.hidden = true;

        if (info) {
          info.textContent = "Please select a session.";
        }

        return;
      }

      const session = attendanceSessions.find(
        item => item.id === sessionId
      );

      if (!session) {
        if (form) form.hidden = true;

        if (info) {
          info.textContent = "Session not found.";
        }

        return;
      }

      if (info) {
        info.textContent =
          `${session.className} | Section ${session.section} | ` +
          `${session.department} | Advisor: ${session.advisorName}`;
      }

      if (form) {
        form.hidden = false;
      }
    });

    on(
      "attendanceMarkForm",
      "submit",
      saveSessionAttendance
    );
  }

  // ==========================================
  // 20. CREATE ATTENDANCE SESSION
  // ==========================================

  async function createAttendanceSession(event) {
    event.preventDefault();

    if (!isAdmin()) {
      showToast("Only the administrator can create sessions.");
      return;
    }

    if (!isAttendanceTimeOpen()) {
      showToast(
        "Sessions can only be created between 8:00 and 8:40 AM PKT."
      );

      updateAttendanceWindow();
      return;
    }

    const className = $("sessionClass")?.value.trim();
    const section = $("sessionSection")?.value.trim();
    const department = $("sessionDepartment")?.value.trim();
    const advisorName = $("sessionAdvisor")?.value.trim();

    if (!className || !section || !department || !advisorName) {
      showToast("Please complete all session details.");
      return;
    }

    try {
      const ref = await db.collection("attendanceSessions").add({
        className,
        section,
        department,
        advisorName,
        date: getPKTDate(),
        createdBy: currentUser.uid,
        createdAt: serverTime()
      });

      currentAttendanceSessionId = ref.id;

      $("attendanceSessionForm").reset();

      await createUpdateNotification(
        "Attendance Session Created",
        "The college administration has created a new attendance session."
      );

      showToast("Attendance session created successfully.");

      await loadTodayAttendanceSessions();

      $("attendanceSessionSelect").value = ref.id;

      $("attendanceSessionSelect").dispatchEvent(
        new Event("change")
      );

    } catch (error) {
      console.error("Session creation:", error);
      showToast(friendlyError(error));
    }
  }

  // ==========================================
  // 21. SAVE STUDENT ATTENDANCE
  // ==========================================

  async function saveSessionAttendance(event) {
    event.preventDefault();

    if (!isAdmin()) {
      showToast("Only the administrator can mark attendance.");
      return;
    }

    if (!isAttendanceTimeOpen()) {
      showToast(
        "Attendance is closed. Available from 8:00 to 8:40 AM PKT."
      );

      updateAttendanceWindow();
      return;
    }

    if (!currentAttendanceSessionId) {
      showToast("Please create or select an attendance session.");
      return;
    }

    const studentName =
      $("attendanceStudentName")?.value.trim();

    const rollNumber =
      $("attendanceRollNumber")?.value.trim();

    const studentEmail =
      $("attendanceStudentEmail")?.value.trim().toLowerCase();

    const date = $("attendanceDate")?.value;
    const status = $("attendanceStatus")?.value;

    if (
      !studentName ||
      !rollNumber ||
      !studentEmail ||
      !date ||
      !status
    ) {
      showToast("Please complete all student details.");
      return;
    }

    if (date !== getPKTDate()) {
      showToast("Attendance can only be marked for today's date.");
      return;
    }

    const session = attendanceSessions.find(
      item => item.id === currentAttendanceSessionId
    );

    if (!session || session.date !== getPKTDate()) {
      showToast("Please select a valid session for today.");
      return;
    }

    try {
      const studentSnapshot = await db
        .collection("users")
        .where("email", "==", studentEmail)
        .get();

      if (studentSnapshot.empty) {
        throw new Error(
          "No registered account was found with this email."
        );
      }

      const studentDoc = studentSnapshot.docs.find(
        doc => doc.data().role === "student"
      );

      if (!studentDoc) {
        throw new Error(
          "This email does not belong to a student account."
        );
      }

      const safeRoll =
        rollNumber.replace(/[^a-zA-Z0-9_-]/g, "_");

      const recordId =
        `${currentAttendanceSessionId}_${safeRoll}`;

      await db.collection("attendance")
        .doc(recordId)
        .set({
          sessionId: currentAttendanceSessionId,
          studentUid: studentDoc.id,
          studentEmail,
          studentName,
          rollNumber,
          className: session.className,
          section: session.section,
          department: session.department,
          advisorName: session.advisorName,
          date,
          status,
          markedBy: currentUser.uid,
          updatedAt: serverTime()
        });

      // Send notification only to the relevant student.
      await createUpdateNotification(
        "Attendance Updated",
        `Your attendance for ${date} has been marked: ${status}.`,
        studentDoc.id
      );

      setStatus(
        "attendanceAdminMessage",
        "Student attendance saved successfully.",
        true
      );

      showToast("Attendance marked successfully.");

      $("attendanceMarkForm").reset();
      $("attendanceDate").value = getPKTDate();

    } catch (error) {
      console.error("Attendance save:", error);

      setStatus(
        "attendanceAdminMessage",
        friendlyError(error)
      );
    }
  }

  // ==========================================
  // 22. PUBLIC DATA LOADING
  // ==========================================

  async function loadPublicData() {
    if (!db) return;

    await Promise.allSettled([
      loadFaculty(),
      loadLectures(),
      loadNotifications()
    ]);
  }

  // ==========================================
  // 23. START APPLICATION
  // ==========================================

  initializeFirebase();

// Notification permission popup after sign-in
function showNotificationPrompt() {
    const prompt = document.getElementById("notificationPrompt");

    if (!prompt || !currentUser) return;

    if (!("Notification" in window)) return;

    if (Notification.permission === "granted") return;
    if (Notification.permission === "denied") return;

    if (localStorage.getItem("notificationChoice_" + currentUser.uid)) {
        return;
    }

    prompt.hidden = false;
}

// Allow button
document.getElementById("allowNotifications")?.addEventListener("click", async () => {
    const prompt = document.getElementById("notificationPrompt");

    await enablePushNotifications();

    if (Notification.permission === "granted") {
        localStorage.setItem(
            "notificationChoice_" + currentUser.uid,
            "allowed"
        );
        prompt.hidden = true;
    }
});

// Block button
document.getElementById("blockNotifications")?.addEventListener("click", () => {
    const prompt = document.getElementById("notificationPrompt");

    localStorage.setItem(
        "notificationChoice_" + currentUser.uid,
        "blocked"
    );

    prompt.hidden = true;
});
})();
