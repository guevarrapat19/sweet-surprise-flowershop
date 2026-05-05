(function () {
  "use strict";

  var FIREBASE_CONFIG = window.SSF_FIREBASE_CONFIG || null;
  var ADMIN_EMAILS = ["mianongalilee@gmail.com", "almarionestine@gmail.com"];
  var RIDER_EMAILS = ["rider@sweetsurprise.com", "rainierdelossantos@gmail.com", "jefferytangcuangco@gmail.com"];
  var ORDER_STATUSES = {
    PENDING: "pending",
    AWAITING_PAYMENT_REVIEW: "awaiting_payment_review",
    APPROVED: "approved",
    RIDER_ASSIGNED: "rider_assigned",
    OUT_FOR_DELIVERY: "out_for_delivery",
    PAID_DELIVERY_SUCCESS: "paid_delivery_success",
    RECEIVED_BY_CUSTOMER: "received_by_customer",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
    DELIVERED: "delivered",
  };

  var fbAuth = null;
  var fbDb = null;
  var currentUser = null;
  var currentPage = document.body.getAttribute("data-page") || "";

  function formatPHP(n) {
    return "₱" + Number(n || 0).toLocaleString("en-PH");
  }

  function prettyStatus(s) {
    var map = {
      pending: "Pending",
      awaiting_payment_review: "Awaiting payment review",
      approved: "Approved",
      rider_assigned: "Rider assigned",
      out_for_delivery: "Out for delivery",
      paid_delivery_success: "Paid delivery success",
      received_by_customer: "Received by customer",
      completed: "Completed",
      cancelled: "Cancelled",
      delivered: "Delivered",
    };
    return map[s] || s || "Pending";
  }

  function roleByEmail(email) {
    var e = String(email || "").toLowerCase();
    if (ADMIN_EMAILS.indexOf(e) !== -1) return "admin";
    if (RIDER_EMAILS.indexOf(e) !== -1) return "rider";
    return "user";
  }

  function initFirebase() {
    if (!window.firebase || !FIREBASE_CONFIG || !FIREBASE_CONFIG.apiKey) return false;
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    fbAuth = firebase.auth();
    fbDb = firebase.database();
    return true;
  }

  function notify(msg) {
    var el = document.getElementById("page-notice");
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
  }

  function rowHtml(o) {
    return (
      '<article class="order-card">' +
      '<div class="order-card-top"><strong>' +
      o.orderRef +
      "</strong><span class='status-pill status-pending'>" +
      prettyStatus(o.status) +
      "</span></div>" +
      "<p class='order-meta muted small'>Customer: " +
      ((o.customer && o.customer.name) || "N/A") +
      " • Payment: " +
      String(o.payment || "cod").toUpperCase() +
      " • Total: " +
      formatPHP(o.total || 0) +
      "</p>" +
      "</article>"
    );
  }

  async function loadRiders() {
    var riders = [];
    try {
      var snap = await fbDb.ref("profiles").get();
      var raw = snap.exists() ? snap.val() : {};
      Object.keys(raw || {}).forEach(function (uid) {
        var p = raw[uid];
        if (p && (p.role === "rider" || roleByEmail(p.email) === "rider")) {
          riders.push({ uid: uid, name: p.fullName || p.email || uid });
        }
      });
    } catch (e) {}
    return riders;
  }

  async function updateOrderStatus(order, nextStatus, extraPatch) {
    var patch = Object.assign(
      {
        status: nextStatus,
      },
      extraPatch || {}
    );
    var nextHistory = Array.isArray(order.statusHistory) ? order.statusHistory.slice() : [];
    nextHistory.push({ status: nextStatus, at: new Date().toISOString() });
    patch.statusHistory = nextHistory;
    await fbDb.ref("orders_by_ref/" + order.orderRef).update(patch);
    if (order.account && order.account.uid) {
      await fbDb.ref("orders/" + order.account.uid + "/" + order.orderRef).update(patch);
    }
  }

  function renderOrders(host, orders, renderer) {
    host.innerHTML = "";
    if (!orders.length) {
      host.innerHTML = '<p class="muted small">No orders found.</p>';
      return;
    }
    orders.forEach(function (o) {
      var wrapper = document.createElement("div");
      wrapper.innerHTML = renderer(o);
      host.appendChild(wrapper.firstChild);
    });
  }

  async function loadUserOrders() {
    var host = document.getElementById("orders-list");
    if (!currentUser || !host) return;
    var snap = await fbDb.ref("orders/" + currentUser.uid).get();
    var raw = snap.exists() ? snap.val() : {};
    var orders = Object.keys(raw || {}).map(function (k) {
      return raw[k];
    });
    orders.sort(function (a, b) {
      return new Date(b.placedAt || 0).getTime() - new Date(a.placedAt || 0).getTime();
    });

    renderOrders(host, orders, function (o) {
      var base = rowHtml(o);
      if (o.status === ORDER_STATUSES.PAID_DELIVERY_SUCCESS || o.status === ORDER_STATUSES.OUT_FOR_DELIVERY || o.status === ORDER_STATUSES.DELIVERED) {
        return (
          base.replace(
            "</article>",
            '<div class="order-actions"><button class="ghost js-received" data-ref="' +
              o.orderRef +
              '">Order received</button></div></article>'
          )
        );
      }
      return base;
    });

    host.querySelectorAll(".js-received").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var ref = btn.getAttribute("data-ref");
        var o = orders.find(function (x) {
          return x.orderRef === ref;
        });
        if (!o) return;
        await updateOrderStatus(o, ORDER_STATUSES.RECEIVED_BY_CUSTOMER, { receivedByCustomerAt: new Date().toISOString() });
        notify("Order marked as received.");
        loadUserOrders();
      });
    });
  }

  async function loadAdminOrders() {
    var host = document.getElementById("orders-list");
    if (!host) return;
    var snap = await fbDb.ref("orders_by_ref").get();
    var raw = snap.exists() ? snap.val() : {};
    var orders = Object.keys(raw || {}).map(function (k) {
      return raw[k];
    });
    orders.sort(function (a, b) {
      return new Date(b.placedAt || 0).getTime() - new Date(a.placedAt || 0).getTime();
    });
    var riders = await loadRiders();

    renderOrders(host, orders, function (o) {
      var actions = "";
      if (o.status === ORDER_STATUSES.PENDING && o.payment === "gcash") {
        actions +=
          '<button class="primary js-status" data-ref="' +
          o.orderRef +
          '" data-next="approved" data-payment-received="true">Payment received</button>';
      }
      if (o.status === ORDER_STATUSES.PENDING && o.payment !== "gcash") {
        actions += '<button class="primary js-status" data-ref="' + o.orderRef + '" data-next="approved">Approve</button>';
      }
      if (o.status === ORDER_STATUSES.AWAITING_PAYMENT_REVIEW) {
        actions +=
          '<button class="primary js-status" data-ref="' +
          o.orderRef +
          '" data-next="approved" data-payment-received="true">Payment received</button>';
        actions += '<button class="ghost js-status" data-ref="' + o.orderRef + '" data-next="cancelled">Cancel order</button>';
      }
      if (o.status === ORDER_STATUSES.PENDING) {
        actions += '<button class="ghost js-status" data-ref="' + o.orderRef + '" data-next="cancelled">Cancel order</button>';
      }
      if (o.status === ORDER_STATUSES.APPROVED) {
        var opts = riders
          .map(function (r) {
            return '<option value="' + r.uid + '">' + r.name + "</option>";
          })
          .join("");
        actions +=
          '<select class="js-rider" data-ref="' + o.orderRef + '"><option value="">Assign rider...</option>' + opts + "</select>";
      }
      if (o.status === ORDER_STATUSES.RECEIVED_BY_CUSTOMER || o.status === ORDER_STATUSES.PAID_DELIVERY_SUCCESS) {
        actions += '<button class="ghost js-status" data-ref="' + o.orderRef + '" data-next="completed">Close order</button>';
      }
      return rowHtml(o).replace("</article>", '<div class="order-actions">' + actions + "</div></article>");
    });

    host.querySelectorAll(".js-status").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var ref = btn.getAttribute("data-ref");
        var next = btn.getAttribute("data-next");
        var paymentReceived = btn.getAttribute("data-payment-received") === "true";
        var order = orders.find(function (x) {
          return x.orderRef === ref;
        });
        if (!order) return;
        await updateOrderStatus(order, next, paymentReceived ? { paymentReceivedAt: new Date().toISOString() } : null);
        notify("Order updated.");
        loadAdminOrders();
      });
    });

    host.querySelectorAll(".js-rider").forEach(function (sel) {
      sel.addEventListener("change", async function () {
        if (!sel.value) return;
        var ref = sel.getAttribute("data-ref");
        var rider = riders.find(function (r) {
          return r.uid === sel.value;
        });
        var order = orders.find(function (x) {
          return x.orderRef === ref;
        });
        if (!order || !rider) return;
        await updateOrderStatus(order, ORDER_STATUSES.RIDER_ASSIGNED, {
          riderUid: rider.uid,
          riderName: rider.name,
          assignedAt: new Date().toISOString(),
        });
        notify("Rider assigned.");
        loadAdminOrders();
      });
    });
  }

  async function loadRiderOrders() {
    var host = document.getElementById("orders-list");
    if (!host || !currentUser) return;
    var snap = await fbDb.ref("orders_by_ref").get();
    var raw = snap.exists() ? snap.val() : {};
    var orders = Object.keys(raw || {})
      .map(function (k) {
        return raw[k];
      })
      .filter(function (o) {
        return o && o.riderUid === currentUser.uid;
      });

    renderOrders(host, orders, function (o) {
      var actions = "";
      if (o.status === ORDER_STATUSES.RIDER_ASSIGNED) {
        actions += '<button class="primary js-next" data-ref="' + o.orderRef + '" data-next="out_for_delivery">Out for delivery</button>';
      } else if (o.status === ORDER_STATUSES.OUT_FOR_DELIVERY) {
        if (o.payment === "cod") {
          actions +=
            '<button class="primary js-next" data-ref="' +
            o.orderRef +
            '" data-next="paid_delivery_success">Successful transaction (COD)</button>';
        } else {
          actions += '<button class="primary js-next" data-ref="' + o.orderRef + '" data-next="delivered">Delivered</button>';
        }
      }
      return rowHtml(o).replace("</article>", '<div class="order-actions">' + actions + "</div></article>");
    });

    host.querySelectorAll(".js-next").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var ref = btn.getAttribute("data-ref");
        var next = btn.getAttribute("data-next");
        var order = orders.find(function (x) {
          return x.orderRef === ref;
        });
        if (!order) return;
        await updateOrderStatus(order, next);
        notify("Delivery updated.");
        loadRiderOrders();
      });
    });
  }

  function guardRole() {
    if (!currentUser) return;
    var role = currentUser.role || roleByEmail(currentUser.email);
    if (currentPage === "admin" && role !== "admin") {
      alert("Admin account required.");
      location.href = "user-orders.html";
      return;
    }
    if (currentPage === "rider" && role !== "rider") {
      alert("Rider account required.");
      location.href = "user-orders.html";
    }
  }

  function bindTopbar() {
    var emailEl = document.getElementById("user-email");
    var logoutBtn = document.getElementById("logout-btn");
    var ordersLink = document.getElementById("nav-orders-link");
    var adminLink = document.getElementById("nav-admin-link");
    var riderLink = document.getElementById("nav-rider-link");
    var role = currentUser ? currentUser.role || roleByEmail(currentUser.email) : "user";
    if (emailEl && currentUser) emailEl.textContent = currentUser.email || "Logged in";
    if (ordersLink) {
      ordersLink.hidden = !currentUser;
      ordersLink.href = role === "admin" ? "admin-orders.html" : role === "rider" ? "rider-orders.html" : "user-orders.html";
    }
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

  function isoFromLocalDatetime(value) {
    if (!value) return "";
    var d = new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toISOString();
  }

  function localDatetimeFromIso(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    var hh = String(d.getHours()).padStart(2, "0");
    var mi = String(d.getMinutes()).padStart(2, "0");
    return yyyy + "-" + mm + "-" + dd + "T" + hh + ":" + mi;
  }

  function promoCardHtml(promo) {
    var payments = Array.isArray(promo.allowedPayments) ? promo.allowedPayments.join(", ").toUpperCase() : "ALL";
    return (
      '<article class="order-card">' +
      '<div class="order-card-top"><strong>' +
      promo.code +
      "</strong><span class='status-pill " +
      (promo.active ? "status-approved" : "status-pending") +
      "'>" +
      (promo.active ? "Active" : "Inactive") +
      "</span></div>" +
      "<p class='order-meta muted small'>" +
      (promo.type === "percent" ? promo.value + "% OFF" : "₱" + Number(promo.value || 0) + " OFF") +
      " • Min subtotal: ₱" +
      Number(promo.minSubtotal || 0) +
      " • Payments: " +
      payments +
      "</p>" +
      "<p class='order-meta muted small'>Start: " +
      (promo.startAt || "Anytime") +
      " • End: " +
      (promo.endAt || "No end") +
      "</p>" +
      '<div class="order-actions">' +
      '<button class="ghost js-promo-edit" data-code="' + promo.code + '">Edit</button>' +
      '<button class="ghost js-promo-toggle" data-code="' + promo.code + '" data-active="' + (promo.active ? "1" : "0") + '">' +
      (promo.active ? "Disable" : "Enable") +
      "</button>" +
      '<button class="ghost js-promo-delete" data-code="' + promo.code + '">Delete</button>' +
      "</div></article>"
    );
  }

  async function loadPromosAdmin() {
    if (currentPage !== "admin" || !currentUser || currentUser.role !== "admin") return;
    var host = document.getElementById("promo-list");
    var form = document.getElementById("promo-form");
    if (!host || !form) return;
    var snap = await fbDb.ref("promos").get();
    var raw = snap.exists() ? snap.val() : {};
    var promos = Object.keys(raw || {}).map(function (k) {
      var p = raw[k] || {};
      return Object.assign({ code: k, active: true, type: "percent", value: 10, minSubtotal: 0, allowedPayments: ["cod", "gcash", "maya"] }, p);
    });
    promos.sort(function (a, b) {
      return String(a.code).localeCompare(String(b.code));
    });
    host.innerHTML = promos.length ? promos.map(promoCardHtml).join("") : '<p class="muted small">No promos yet.</p>';

    host.querySelectorAll(".js-promo-edit").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var code = btn.getAttribute("data-code");
        var p = promos.find(function (x) {
          return x.code === code;
        });
        if (!p) return;
        form.querySelector('[name="code"]').value = p.code || "";
        form.querySelector('[name="type"]').value = p.type || "percent";
        form.querySelector('[name="value"]').value = p.value || "";
        form.querySelector('[name="minSubtotal"]').value = p.minSubtotal || "";
        form.querySelector('[name="startAt"]').value = localDatetimeFromIso(p.startAt || "");
        form.querySelector('[name="endAt"]').value = localDatetimeFromIso(p.endAt || "");
        form.querySelector('[name="active"]').checked = !!p.active;
        var allow = Array.isArray(p.allowedPayments) ? p.allowedPayments : [];
        form.querySelector('[name="allow_cod"]').checked = allow.indexOf("cod") !== -1;
        form.querySelector('[name="allow_gcash"]').checked = allow.indexOf("gcash") !== -1;
        form.querySelector('[name="allow_maya"]').checked = allow.indexOf("maya") !== -1;
      });
    });

    host.querySelectorAll(".js-promo-toggle").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var code = btn.getAttribute("data-code");
        var active = btn.getAttribute("data-active") === "1";
        await fbDb.ref("promos/" + code + "/active").set(!active);
        notify("Promo updated.");
        loadPromosAdmin();
      });
    });

    host.querySelectorAll(".js-promo-delete").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var code = btn.getAttribute("data-code");
        if (!confirm("Delete promo " + code + "?")) return;
        await fbDb.ref("promos/" + code).remove();
        notify("Promo deleted.");
        loadPromosAdmin();
      });
    });
  }

  function initPromoForm() {
    if (currentPage !== "admin") return;
    var form = document.getElementById("promo-form");
    if (!form) return;
    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      if (!currentUser || currentUser.role !== "admin") {
        notify("Admin account required.");
        return;
      }
      var data = new FormData(form);
      var code = String(data.get("code") || "").trim().toUpperCase();
      if (!code) {
        notify("Promo code is required.");
        return;
      }
      var allowedPayments = [];
      if (data.get("allow_cod")) allowedPayments.push("cod");
      if (data.get("allow_gcash")) allowedPayments.push("gcash");
      if (data.get("allow_maya")) allowedPayments.push("maya");
      if (!allowedPayments.length) {
        notify("Select at least one allowed payment.");
        return;
      }
      var payload = {
        code: code,
        type: String(data.get("type") || "percent"),
        value: Number(data.get("value") || 0),
        minSubtotal: Number(data.get("minSubtotal") || 0),
        startAt: isoFromLocalDatetime(String(data.get("startAt") || "")),
        endAt: isoFromLocalDatetime(String(data.get("endAt") || "")),
        active: !!data.get("active"),
        allowedPayments: allowedPayments,
        updatedAt: new Date().toISOString(),
      };
      await fbDb.ref("promos/" + code).set(payload);
      notify("Promo saved.");
      form.reset();
      loadPromosAdmin();
    });
  }

  function boot() {
    if (!initFirebase()) return;
    fbAuth.onAuthStateChanged(async function (u) {
      if (!u) {
        location.href = "index.html";
        return;
      }
      var snap = await fbDb.ref("profiles/" + u.uid).get();
      var profile = snap.exists() ? snap.val() : null;
      currentUser = {
        uid: u.uid,
        email: u.email || "",
        role: (profile && profile.role) || roleByEmail(u.email || ""),
      };
      bindTopbar();
      guardRole();

      if (currentPage === "user") loadUserOrders();
      if (currentPage === "admin" && currentUser.role === "admin") {
        initPromoForm();
        loadPromosAdmin();
        loadAdminOrders();
      }
      if (currentPage === "rider" && currentUser.role === "rider") loadRiderOrders();
    });
  }

  boot();
})();
