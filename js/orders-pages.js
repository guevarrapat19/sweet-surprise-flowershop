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
    if (currentPage === "admin" && role !== "admin") notify("Admin account required.");
    if (currentPage === "rider" && role !== "rider") notify("Rider account required.");
  }

  function bindTopbar() {
    var emailEl = document.getElementById("user-email");
    var logoutBtn = document.getElementById("logout-btn");
    if (emailEl && currentUser) emailEl.textContent = currentUser.email || "Logged in";
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        fbAuth.signOut().then(function () {
          location.href = "index.html";
        });
      });
    }
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
      if (currentPage === "admin" && currentUser.role === "admin") loadAdminOrders();
      if (currentPage === "rider" && currentUser.role === "rider") loadRiderOrders();
    });
  }

  boot();
})();
