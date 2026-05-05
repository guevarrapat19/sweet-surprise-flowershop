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
  var RIDER_ACTIVE_FIELD = "active";

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

  function statusClass(s) {
    if (s === ORDER_STATUSES.APPROVED || s === ORDER_STATUSES.COMPLETED || s === ORDER_STATUSES.PAID_DELIVERY_SUCCESS) return "status-approved";
    if (s === ORDER_STATUSES.OUT_FOR_DELIVERY || s === ORDER_STATUSES.DELIVERED || s === ORDER_STATUSES.RIDER_ASSIGNED) return "status-out-for-delivery";
    return "status-pending";
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

  function normalizeProductRecord(id, raw) {
    var rec = Object.assign(
      {
        id: id,
        title: "",
        description: "",
        price: 0,
        image: "",
        hidden: false,
        outOfStock: false,
        isDeleted: false,
      },
      raw || {}
    );
    rec.price = Number(rec.price || 0);
    return rec;
  }

  function rowHtml(o) {
    var customerName = (o.customer && o.customer.name) || "N/A";
    var customerEmail = (o.customer && o.customer.email) || "";
    return (
      '<article class="order-card">' +
      '<div class="order-card-top"><strong>' +
      o.orderRef +
      "</strong><span class='status-pill " +
      statusClass(o.status) +
      "'>" +
      prettyStatus(o.status) +
      "</span></div>" +
      "<p class='order-meta muted small'>Customer: " +
      customerName +
      (customerEmail ? " (" + customerEmail + ")" : "") +
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
          var active = p[RIDER_ACTIVE_FIELD] !== false;
          if (active) {
            riders.push({ uid: uid, name: p.fullName || p.email || uid, email: p.email || "" });
          }
        }
      });
    } catch (e) {
      notify("Failed to load riders: " + (e && e.message ? e.message : "Unknown error"));
    }
    return riders;
  }

  async function loadRiderAdminPanel() {
    if (currentPage !== "admin") return;
    var host = document.getElementById("rider-admin-list");
    var form = document.getElementById("rider-admin-form");
    if (!host) return;
    if (form && !form._ssfBound) {
      form._ssfBound = true;
      form.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        var data = new FormData(form);
        var email = String(data.get("email") || "").trim().toLowerCase();
        if (!email) {
          notify("Rider email is required.");
          return;
        }
        try {
          var snapAll = await fbDb.ref("profiles").get();
          var rawAll = snapAll.exists() ? snapAll.val() : {};
          var targetUid = null;
          Object.keys(rawAll || {}).forEach(function (uid) {
            var p = rawAll[uid] || {};
            if (!targetUid && String(p.email || "").toLowerCase() === email) {
              targetUid = uid;
            }
          });
          if (!targetUid) {
            notify("No account with that email yet. Ask the rider to register first, then try again.");
            return;
          }
          await fbDb
            .ref("profiles/" + targetUid)
            .update({ role: "rider", active: true, updatedAt: new Date().toISOString() });
          notify("Rider role added/updated.");
          loadRiderAdminPanel();
        } catch (e) {
          notify("Failed to add rider: " + (e && e.message ? e.message : "Unknown error"));
        }
      });
    }
    try {
      var snap = await fbDb.ref("profiles").get();
      var raw = snap.exists() ? snap.val() : {};
      var riders = Object.keys(raw || [])
        .map(function (uid) {
          var p = raw[uid] || {};
          return {
            uid: uid,
            role: p.role || roleByEmail(p.email || ""),
            name: p.fullName || "",
            email: p.email || "",
            active: p[RIDER_ACTIVE_FIELD] !== false,
          };
        })
        .filter(function (r) {
          return r.role === "rider";
        });
      if (!riders.length) {
        host.innerHTML = '<p class="muted small">No rider profiles found.</p>';
        return;
      }
      host.innerHTML = riders
        .map(function (r) {
          return (
            '<article class="order-card">' +
            '<div class="order-card-top"><strong>' +
            (r.name || r.email || r.uid) +
            "</strong><span class='status-pill " +
            (r.active ? "status-approved'>Active" : "status-pending'>Inactive") +
            "</span></div>" +
            "<p class='order-meta muted small'>" +
            (r.email || "No email") +
            "</p>" +
            '<div class="order-actions">' +
            '<button class="ghost js-rider-toggle" data-uid="' +
            r.uid +
            '" data-next="' +
            (r.active ? "0" : "1") +
            '">' +
            (r.active ? "Deactivate" : "Activate") +
            "</button>" +
            '<button class="ghost js-rider-remove" data-uid="' +
            r.uid +
            '">Remove rider role</button>' +
            "</div></article>"
          );
        })
        .join("");

      host.querySelectorAll(".js-rider-toggle").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var uid = btn.getAttribute("data-uid");
          var next = btn.getAttribute("data-next") === "1";
          await fbDb.ref("profiles/" + uid + "/" + RIDER_ACTIVE_FIELD).set(next);
          notify("Rider status updated.");
          loadRiderAdminPanel();
        });
      });
      host.querySelectorAll(".js-rider-remove").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var uid = btn.getAttribute("data-uid");
          if (!confirm("Remove rider role for this account?")) return;
          await fbDb.ref("profiles/" + uid).update({ role: "user", active: true, updatedAt: new Date().toISOString() });
          notify("Rider role removed.");
          loadRiderAdminPanel();
        });
      });
    } catch (e) {
      notify("Failed to load rider manager: " + (e && e.message ? e.message : "Unknown error"));
    }
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
    var raw = {};
    try {
      var snap = await fbDb.ref("orders_by_ref").get();
      raw = snap.exists() ? snap.val() : {};
    } catch (e) {
      notify("Failed to load admin orders: " + (e && e.message ? e.message : "Unknown error"));
      return;
    }
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
    loadRiderAdminPanel();
  }

  async function loadRiderOrders() {
    var host = document.getElementById("orders-list");
    if (!host || !currentUser) return;
    var raw = {};
    try {
      var snap = await fbDb.ref("orders_by_ref").get();
      raw = snap.exists() ? snap.val() : {};
    } catch (e) {
      notify("Failed to load rider orders: " + (e && e.message ? e.message : "Unknown error"));
      return;
    }
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
    var raw = {};
    try {
      var snap = await fbDb.ref("promos").get();
      raw = snap.exists() ? snap.val() : {};
    } catch (e) {
      notify("Failed to load promos: " + (e && e.message ? e.message : "Unknown error"));
      return;
    }
    var promos = Object.keys(raw || {}).map(function (k) {
      var p = raw[k] || {};
      return Object.assign({ code: k, active: true, type: "percent", value: 10, minSubtotal: 0, allowedPayments: ["cod", "gcash"] }, p);
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
      try {
        await fbDb.ref("promos/" + code).set(payload);
        notify("Promo saved.");
        form.reset();
        loadPromosAdmin();
      } catch (e) {
        notify("Failed to save promo: " + (e && e.message ? e.message : "Unknown error"));
      }
    });
  }

  async function loadAdminProducts() {
    if (currentPage !== "admin") return;
    var host = document.getElementById("admin-products-list");
    if (!host) return;
    try {
      var snap = await fbDb.ref("products").get();
      var raw = snap.exists() ? snap.val() : {};
      var products = Object.keys(raw || {}).map(function (id) {
        return normalizeProductRecord(id, raw[id] || {});
      });
      products.sort(function (a, b) {
        return String(a.title || "").localeCompare(String(b.title || ""));
      });
      if (!products.length) {
        host.innerHTML = '<p class="muted small">No products yet. Add your first bouquet.</p>';
        return;
      }
      host.innerHTML = products
        .map(function (p) {
          var flags = [];
          if (p.hidden) flags.push("Hidden");
          if (p.outOfStock) flags.push("Out of stock");
          if (p.isDeleted) flags.push("Archived");
          var flagText = flags.length ? " • " + flags.join(" • ") : "";
          return (
            '<article class="order-card">' +
            '<div class="order-card-top"><strong>' +
            p.title +
            "</strong></div>" +
            "<p class='order-meta muted small'>PHP " +
            Number(p.price || 0) +
            " • " +
            (p.image || "no-image.jpg") +
            flagText +
            "</p>" +
            '<div class="order-actions">' +
            '<button class="ghost js-prod-edit" data-id="' +
            p.id +
            '">Edit</button>' +
            '<button class="ghost js-prod-toggle-hide" data-id="' +
            p.id +
            '" data-next="' +
            (p.hidden ? "0" : "1") +
            '">' +
            (p.hidden ? "Show" : "Hide") +
            "</button>" +
            '<button class="ghost js-prod-toggle-stock" data-id="' +
            p.id +
            '" data-next="' +
            (p.outOfStock ? "0" : "1") +
            '">' +
            (p.outOfStock ? "Mark in stock" : "Mark out of stock") +
            "</button>" +
            '<button class="ghost js-prod-archive" data-id="' +
            p.id +
            '" data-next="' +
            (p.isDeleted ? "0" : "1") +
            '">' +
            (p.isDeleted ? "Restore" : "Archive") +
            "</button>" +
            "</div></article>"
          );
        })
        .join("");

      var form = document.getElementById("admin-product-form");
      if (form) {
        host.querySelectorAll(".js-prod-edit").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var id = btn.getAttribute("data-id");
            var prod = products.find(function (p) {
              return p.id === id;
            });
            if (!prod) return;
            form.querySelector('[name="product_id"]').value = prod.id;
            form.querySelector('[name="title"]').value = prod.title || "";
            form.querySelector('[name="description"]').value = prod.description || "";
            form.querySelector('[name="price"]').value = prod.price || "";
            form.querySelector('[name="image"]').value = prod.image || "";
          });
        });
      }

      host.querySelectorAll(".js-prod-toggle-hide").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var id = btn.getAttribute("data-id");
          var next = btn.getAttribute("data-next") === "1";
          await fbDb.ref("products/" + id + "/hidden").set(next);
          notify("Product visibility updated.");
          loadAdminProducts();
        });
      });
      host.querySelectorAll(".js-prod-toggle-stock").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var id = btn.getAttribute("data-id");
          var next = btn.getAttribute("data-next") === "1";
          await fbDb.ref("products/" + id + "/outOfStock").set(next);
          notify("Product stock updated.");
          loadAdminProducts();
        });
      });
      host.querySelectorAll(".js-prod-archive").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var id = btn.getAttribute("data-id");
          var next = btn.getAttribute("data-next") === "1";
          await fbDb.ref("products/" + id + "/isDeleted").set(next);
          notify(next ? "Product archived." : "Product restored.");
          loadAdminProducts();
        });
      });
    } catch (e) {
      notify("Failed to load products: " + (e && e.message ? e.message : "Unknown error"));
    }
  }

  function initAdminProductForm() {
    if (currentPage !== "admin") return;
    var form = document.getElementById("admin-product-form");
    var resetBtn = document.getElementById("admin-product-reset");
    if (!form || form._ssfBound) return;
    form._ssfBound = true;
    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      if (!currentUser || currentUser.role !== "admin") {
        notify("Admin account required.");
        return;
      }
      var data = new FormData(form);
      var id = String(data.get("product_id") || "").trim();
      var title = String(data.get("title") || "").trim();
      var description = String(data.get("description") || "").trim();
      var price = Number(data.get("price") || 0);
      var image = String(data.get("image") || "").trim();
      if (!title || !description || !price || !image) {
        notify("All product fields are required.");
        return;
      }
      var payload = {
        title: title,
        description: description,
        price: price,
        image: image,
      };
      try {
        if (id) {
          await fbDb.ref("products/" + id).update(payload);
        } else {
          var ref = fbDb.ref("products").push();
          await ref.set(
            Object.assign(
              {
                hidden: false,
                outOfStock: false,
                isDeleted: false,
              },
              payload
            )
          );
        }
        notify("Product saved.");
        form.reset();
        loadAdminProducts();
      } catch (e) {
        notify("Failed to save product: " + (e && e.message ? e.message : "Unknown error"));
      }
    });
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        form.reset();
        form.querySelector('[name="product_id"]').value = "";
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
        fullName: (profile && profile.fullName) || "",
        phone: (profile && profile.phone) || "",
        role: (profile && profile.role) || roleByEmail(u.email || ""),
      };
      bindTopbar();
      guardRole();

      if (currentPage === "user") loadUserOrders();
      if (currentPage === "admin" && currentUser.role === "admin") {
        initPromoForm();
        loadPromosAdmin();
        initAdminProductForm();
        loadAdminProducts();
        loadAdminOrders();
      }
      if (currentPage === "rider" && currentUser.role === "rider") loadRiderOrders();
    });
  }

  boot();
})();
