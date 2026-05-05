(function () {
  "use strict";

  var FIREBASE_CONFIG = window.SSF_FIREBASE_CONFIG || null;
  var ADMIN_EMAILS = ["mianongalilee@gmail.com", "almarionestine@gmail.com"];
  var RIDER_EMAILS = ["rider@sweetsurprise.com", "rainierdelossantos@gmail.com", "jefferytangcuangco@gmail.com"];
  var fbAuth = null;
  var fbDb = null;
  var currentUser = null;

  function roleByEmail(email) {
    var e = String(email || "").toLowerCase();
    if (ADMIN_EMAILS.indexOf(e) !== -1) return "admin";
    if (RIDER_EMAILS.indexOf(e) !== -1) return "rider";
    return "user";
  }

  function notify(msg) {
    var el = document.getElementById("page-notice");
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
  }

  function initFirebase() {
    if (!window.firebase || !FIREBASE_CONFIG || !FIREBASE_CONFIG.apiKey) return false;
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    fbAuth = firebase.auth();
    fbDb = firebase.database();
    return true;
  }

  function bindTopbar() {
    var emailEl = document.getElementById("user-email");
    var logoutBtn = document.getElementById("logout-btn");
    var ordersLink = document.getElementById("nav-orders-link");
    var profileLink = document.getElementById("nav-profile-link");
    var adminLink = document.getElementById("nav-admin-link");
    var riderLink = document.getElementById("nav-rider-link");
    var role = currentUser ? currentUser.role || roleByEmail(currentUser.email) : "user";
    if (emailEl && currentUser) emailEl.textContent = currentUser.email || "Logged in";
    if (ordersLink) {
      ordersLink.hidden = !currentUser;
      ordersLink.href = role === "admin" ? "admin-orders.html" : role === "rider" ? "rider-orders.html" : "user-orders.html";
    }
    if (profileLink) profileLink.hidden = !currentUser;
    if (adminLink) adminLink.hidden = true;
    if (riderLink) riderLink.hidden = true;
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        fbAuth.signOut().then(function () {
          location.href = "index.html";
        });
      });
    }
  }

  function initNumericOnly() {
    document.querySelectorAll("[data-numeric-only='true']").forEach(function (input) {
      input.addEventListener("input", function () {
        var value = String(input.value || "").replace(/\D/g, "");
        if (value !== input.value) input.value = value;
      });
    });
  }

  function fillProfileForm() {
    var form = document.getElementById("profile-form");
    if (!form || !currentUser) return;
    form.querySelector('[name="fullName"]').value = currentUser.fullName || "";
    form.querySelector('[name="email"]').value = currentUser.email || "";
    form.querySelector('[name="phone"]').value = currentUser.phone || "";
  }

  function initProfileSave() {
    var form = document.getElementById("profile-form");
    if (!form) return;
    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      if (!currentUser) return;
      var data = new FormData(form);
      var fullName = String(data.get("fullName") || "").trim();
      var phone = String(data.get("phone") || "").replace(/\D/g, "").slice(0, 11);
      if (!fullName) {
        notify("Full name is required.");
        return;
      }
      if (phone && !/^09\d{9}$/.test(phone)) {
        notify("Mobile must be 11 digits and start with 09.");
        return;
      }
      await fbDb.ref("profiles/" + currentUser.uid).update({
        fullName: fullName,
        phone: phone,
        updatedAt: new Date().toISOString(),
      });
      currentUser.fullName = fullName;
      currentUser.phone = phone;
      notify("Profile updated.");
    });
  }

  function initPasswordChange() {
    var form = document.getElementById("password-form");
    if (!form) return;
    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      if (!fbAuth.currentUser) return;
      var data = new FormData(form);
      var newPassword = String(data.get("newPassword") || "");
      var confirmPassword = String(data.get("confirmPassword") || "");
      if (newPassword.length < 6) {
        notify("New password must be at least 6 characters.");
        return;
      }
      if (newPassword !== confirmPassword) {
        notify("Password confirmation does not match.");
        return;
      }
      try {
        await fbAuth.currentUser.updatePassword(newPassword);
        form.reset();
        notify("Password updated.");
      } catch (e) {
        notify("Password update failed: " + (e && e.message ? e.message : "Unknown error"));
      }
    });
  }

  function boot() {
    if (!initFirebase()) return;
    initNumericOnly();
    fbAuth.onAuthStateChanged(async function (u) {
      if (!u) {
        location.href = "index.html";
        return;
      }
      var snap = await fbDb.ref("profiles/" + u.uid).get();
      var profile = snap.exists() ? snap.val() : {};
      currentUser = {
        uid: u.uid,
        email: u.email || "",
        fullName: profile.fullName || "",
        phone: profile.phone || "",
        role: profile.role || roleByEmail(u.email || ""),
      };
      bindTopbar();
      fillProfileForm();
      initProfileSave();
      initPasswordChange();
    });
  }

  boot();
})();
