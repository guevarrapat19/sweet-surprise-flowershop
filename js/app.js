(function () {
  "use strict";

  var CART_KEY = "ssf-cart-v1";

  /**
   * Philippines e-wallet: put your shop’s receiving numbers here (no Firebase needed).
   * Customers see them after checkout. Replace placeholders before going live.
   */
  var SHOP_GCASH_NUMBER = "09XX XXX XXXX";
  var AUTH_KEY = "ssf-auth-local-v1";
  var FIREBASE_CONFIG = window.SSF_FIREBASE_CONFIG || null;
  var ADMIN_EMAILS = ["mianongalilee@gmail.com", "almarionestine@gmail.com"];
  var RIDER_EMAILS = ["rider@sweetsurprise.com", "rainierdelossantos@gmail.com", "jefferytangcuangco@gmail.com"];
  var ADMIN_PASSWORD = "admin123";
  var firebaseReady = false;
  var fbAuth = null;
  var fbDb = null;
  var currentUser = null;
  var authMode = "login";
  var noticeTimer = null;
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
  var PROMO_CODES = {
    SWEET10: { type: "percent", value: 10 },
    BLOOM50: { type: "fixed", value: 50 },
  };
  var activePromo = null;
  var LEGAL_VERSION = "SSF-LEGAL-v1.0-2026-05-05";

  function formatPHP(n) {
    return "₱" + n.toLocaleString("en-PH");
  }

  function slugify(text) {
    return String(text || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
  }

  function prettyStatus(status) {
    if (status === ORDER_STATUSES.AWAITING_PAYMENT_REVIEW) return "Awaiting payment review";
    if (status === ORDER_STATUSES.APPROVED) return "Approved";
    if (status === ORDER_STATUSES.RIDER_ASSIGNED) return "Rider assigned";
    if (status === ORDER_STATUSES.OUT_FOR_DELIVERY) return "Out for delivery";
    if (status === ORDER_STATUSES.PAID_DELIVERY_SUCCESS) return "Paid delivery success";
    if (status === ORDER_STATUSES.RECEIVED_BY_CUSTOMER) return "Received by customer";
    if (status === ORDER_STATUSES.COMPLETED) return "Completed";
    if (status === ORDER_STATUSES.CANCELLED) return "Cancelled";
    if (status === ORDER_STATUSES.DELIVERED) return "Delivered";
    return "Pending approval";
  }

  function statusClass(status) {
    if (status === ORDER_STATUSES.APPROVED) return "status-approved";
    if (status === ORDER_STATUSES.OUT_FOR_DELIVERY) return "status-out-for-delivery";
    if (status === ORDER_STATUSES.COMPLETED || status === ORDER_STATUSES.RECEIVED_BY_CUSTOMER || status === ORDER_STATUSES.DELIVERED)
      return "status-approved";
    return "status-pending";
  }

  function normalizeOrder(order, fallbackRef) {
    var safe = order || {};
    return {
      orderRef: safe.orderRef || fallbackRef || "N/A",
      placedAt: safe.placedAt || "",
      status: safe.status || ORDER_STATUSES.PENDING,
      payment: safe.payment || "cod",
      total: Number(safe.total || 0),
      customer: safe.customer || {},
      lines: Array.isArray(safe.lines) ? safe.lines : [],
      account: safe.account || {},
    };
  }

  function normalizeProductRecord(product) {
    var p = product || {};
    return Object.assign(
      {
        hidden: false,
        outOfStock: false,
        isDeleted: false,
      },
      p
    );
  }

  function asset(path) {
    return "assets/products/" + encodeURIComponent(path);
  }

  function resolveImageSrc(path) {
    var p = String(path || "");
    return p.indexOf("data:image/") === 0 ? p : asset(p);
  }

  function isAdminEmail(email) {
    var e = String(email || "").toLowerCase();
    return ADMIN_EMAILS.indexOf(e) !== -1;
  }

  function isRiderEmail(email) {
    var e = String(email || "").toLowerCase();
    return RIDER_EMAILS.indexOf(e) !== -1;
  }

  function getRoleFromEmail(email) {
    if (isAdminEmail(email)) return "admin";
    if (isRiderEmail(email)) return "rider";
    return "user";
  }

  /** @type {Array<Object>} */
  var PRODUCTS = [
    {
      id: "big-sunflower-bouquet",
      title: "Big Sunflower Bouquet",
      description:
        "A bold sunflower bouquet with warm, bright tones and full wrap styling.\n\nInclusions:\nSunflower stems\nSeasonal fillers\nPremium bouquet wrap and ribbon",
      images: [
        "big-sunflower-bouquet-p1000-01.jpg",
        "big-sunflower-bouquet-p1000-02.jpg",
        "big-sunflower-bouquet-p1000-03.jpg",
        "big-sunflower-bouquet-p1000-04.jpg",
      ],
      options: {
        colors: ["Yellow", "Orange", "Mixed Warm"],
        wraps: ["Kraft Wrap", "Korean Wrap"],
        ribbons: ["Cream Ribbon", "Gold Ribbon"],
      },
      variants: [{ id: "std", label: "Standard — " + formatPHP(1000), price: 1000, short: "Standard" }],
    },
    {
      id: "blush-pair-bouquet",
      title: "Blush Pair Bouquet",
      description:
        "A soft blush-toned bouquet styled for sweet, minimalist gifting.\n\nInclusions:\nPaired blush focal blooms\nLight filler accents\nClassic wrap and ribbon finish",
      images: ["blush-pair-bouquet-p280.jpg"],
      options: {
        colors: ["Blush Pink", "Peach", "White"],
        wraps: ["Soft Matte Wrap", "Transparent Wrap"],
        ribbons: ["Blush Ribbon", "White Ribbon"],
      },
      variants: [{ id: "std", label: "Standard — " + formatPHP(280), price: 280, short: "Standard" }],
    },
    {
      id: "daisies-round-bouquet",
      title: "Daisies Round Bouquet",
      description:
        "A cheerful round daisy bouquet with fresh color variations by photo.\n\nInclusions:\n30 pcs option: round daisy arrangement\n40 pcs+ option: fuller round daisy arrangement\nBouquet wrap and ribbon",
      images: [
        "daisies-round-bouquent-30pcs-p400-40pcs-p450-01.jpg",
        "daisies-round-bouquent-30pcs-p400-40pcs-p450-02.jpg",
        "daisies-round-bouquent-30pcs-p400-40pcs-p450-03.jpg",
        "daisies-round-bouquent-30pcs-p400-40pcs-p450-04.jpg",
      ],
      variants: [
        { id: "30pcs", label: "30 pcs — " + formatPHP(400), price: 400, short: "30 pcs" },
        { id: "40pcs", label: "40 pcs+ — " + formatPHP(450), price: 450, short: "40 pcs+" },
      ],
      options: {
        colors: ["White Daisy", "Yellow Daisy", "Mixed Daisy"],
        wraps: ["Round Kraft", "Round Korean Wrap"],
        ribbons: ["White Ribbon", "Pink Ribbon"],
      },
    },
    {
      id: "duo-tulips-bouquet",
      title: "Duo Tulips Bouquet",
      description:
        "A compact duo tulip bouquet that highlights clean color pairings.\n\nInclusions:\nTulip duo stems\nMinimal filler styling\nWrap and ribbon",
      images: ["duo-tulips-bouquet-p200-01.jpg", "duo-tulips-bouquet-p200-02.jpg"],
      options: {
        colors: ["Pink + White", "Purple + White", "Red + White"],
        wraps: ["Kraft Wrap", "Mesh Wrap"],
        ribbons: ["White Ribbon", "Red Ribbon"],
      },
      variants: [{ id: "std", label: "Standard — " + formatPHP(200), price: 200, short: "Standard" }],
    },
    {
      id: "glowbloom-bouquet",
      title: "GlowBloom Bouquet",
      description:
        "A premium arranged bouquet with rich tones and a full presentation look.\n\nInclusions:\nMixed premium blooms\nComplementary fillers\nPremium wrap and ribbon",
      images: ["glowbloom-bouquet-p1000-01.jpg", "glowbloom-bouquet-p1000-02.jpg"],
      variants: [{ id: "std", label: "Standard — " + formatPHP(1000), price: 1000, short: "Standard" }],
    },
    {
      id: "kaia-bouquet",
      title: "Kaia Bouquet",
      description:
        "An elegant mixed bouquet with balanced texture and soft color layering.\n\nInclusions:\nMixed feature blooms\nSeasonal fillers\nSignature wrap and ribbon",
      images: ["kaia-bouquet-p750.jpg"],
      variants: [{ id: "std", label: "Standard — " + formatPHP(750), price: 750, short: "Standard" }],
    },
    {
      id: "lilies-round-bouquet",
      title: "Lilies Round Bouquet",
      description:
        "A round lily arrangement with clean structure and graceful petal volume.\n\nInclusions:\nLily stems\nSoft supporting fillers\nRound bouquet wrap and ribbon",
      images: ["lilies-round-bouquet-p850-01.jpg", "lilies-round-bouquet-p850-02.jpg"],
      variants: [{ id: "std", label: "Standard — " + formatPHP(850), price: 850, short: "Standard" }],
    },
    {
      id: "lily-mesh-bouquet",
      title: "Lily Mesh Bouquet",
      description:
        "A mesh-wrapped lily bouquet.\n\nInclusions:\nLily stems\nMesh wrap style\nRibbon tie",
      images: [
        "llly-mesh-bouquet-p180-01.jpg",
        "llly-mesh-bouquet-p180-02.jpg",
        "llly-mesh-bouquet-p180-03.jpg",
        "llly-mesh-bouquet-p180-04.jpg",
      ],
      variants: [{ id: "each", label: "Each — " + formatPHP(180), price: 180, short: "Each" }],
    },
    {
      id: "purple-mix-flower-bouquet",
      title: "Purple Mix Flower Bouquet",
      description:
        "A premium purple-themed mixed bouquet with layered texture and volume.\n\nInclusions:\n12pcs Lilies\n10pcs Spring Fillers\n5pcs Small Daisy\n5pcs Lavender",
      images: ["purple-mix-flower-bouquet-p1600-01.jpg"],
      variants: [{ id: "std", label: "Standard — " + formatPHP(1600), price: 1600, short: "Standard" }],
    },
    {
      id: "single-tulip",
      title: "Single Tulip",
      description:
        "A simple tulip option for single gifting or small bundle orders.\n\nInclusions:\n1 pc option: single tulip stem\n3 pcs option: tulip trio bundle\nBasic wrap finish",
      images: [
        "single-tulip-1pc-p40-3pcs-p100-01.jpg",
        "single-tulip-1pc-p40-3pcs-p100-02.jpg",
        "single-tulip-1pc-p40-3pcs-p100-03.jpg",
      ],
      options: {
        colors: ["Pink", "Red", "Purple", "Yellow", "White"],
        wraps: ["No Wrap", "Simple Wrap"],
        ribbons: ["No Ribbon", "White Ribbon"],
      },
      variants: [
        { id: "1pc", label: "1 pc — " + formatPHP(40), price: 40, short: "1 pc" },
        { id: "3pcs", label: "3 pcs — " + formatPHP(100), price: 100, short: "3 pcs" },
      ],
    },
    {
      id: "single-tulip-bouquet",
      title: "Single Tulip Bouquet",
      description:
        "A single-tulip bouquet series with multiple photo color/style variations.\n\nInclusions:\nTulip stem bouquet\nDecorative wrap\nRibbon tie",
      images: [
        "single-tulip-bouquet-p120-01.jpg",
        "single-tulip-bouquet-p120-02.jpg",
        "single-tulip-bouquet-p120-03.jpg",
        "single-tulip-bouquet-p120-04.jpg",
        "single-tulip-bouquet-p120-05.jpg",
        "single-tulip-bouquet-p120-06.jpg",
        "single-tulip-bouquet-p120-07.jpg",
        "single-tulip-bouquet-p120-08.jpg",
        "single-tulip-bouquet-p120-09.jpg",
      ],
      options: {
        colors: ["Pink", "White", "Purple", "Mixed"],
        wraps: ["Mesh Wrap", "Korean Wrap", "Kraft Wrap"],
        ribbons: ["White Ribbon", "Pink Ribbon", "Lavender Ribbon"],
      },
      variants: [{ id: "each", label: "Each — " + formatPHP(120), price: 120, short: "Each" }],
    },
    {
      id: "sophie-bouquet",
      title: "Sophie Bouquet",
      description:
        "A balanced mixed bouquet suited for birthdays, gratitude, and everyday surprises.\n\nInclusions:\n3pcs tulips\n2 lilies\n2 fillers\n3 daisies",
      images: ["sophie-bouquet-p450.jpg"],
      variants: [{ id: "std", label: "Standard — " + formatPHP(450), price: 450, short: "Standard" }],
    },
    {
      id: "sweet-tulip-bouquet",
      title: "Sweet Tulip Bouquet",
      description:
        "A sweet tulip-forward bouquet with fuller styling and two visual options.\n\nInclusions:\nTulip stems\nAccent fillers\nBouquet wrap and ribbon",
      images: ["sweet-tulip-bouquet-p500-01.jpg", "sweet-tulip-bouquet-p500-02.jpg"],
      variants: [{ id: "std", label: "Standard — " + formatPHP(500), price: 500, short: "Standard" }],
    },
  ];

  function getCart() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function setCart(lines) {
    localStorage.setItem(CART_KEY, JSON.stringify(lines));
    renderCart();
  }

  function cartLineKey(p) {
    return p.productId + ":" + p.variantId + ":" + (p.color || "-") + ":" + (p.wrap || "-") + ":" + (p.ribbon || "-");
  }

  function addToCart(productId, variantId, selectedOptions) {
    var product = PRODUCTS.find(function (x) {
      return x.id === productId;
    });
    if (!product) return;
    var variant = product.variants.find(function (v) {
      return v.id === variantId;
    });
    if (!variant) return;

    var lines = getCart();
    var img = product.externalImage ? product.images[0] : resolveImageSrc(product.images[0]);
    var chosen = selectedOptions || { color: "", wrap: "", ribbon: "" };
    var line = lines.find(function (l) {
      return (
        cartLineKey(l) ===
        cartLineKey({
          productId: productId,
          variantId: variantId,
          color: chosen.color,
          wrap: chosen.wrap,
          ribbon: chosen.ribbon,
        })
      );
    });

    if (line) line.qty += 1;
    else
      lines.push({
        productId: productId,
        variantId: variantId,
        title: product.title,
        variantLabel: variant.short,
        color: chosen.color || "",
        wrap: chosen.wrap || "",
        ribbon: chosen.ribbon || "",
        unitPrice: variant.price,
        qty: 1,
        image: img,
      });

    setCart(lines);
    openCart();
  }

  function updateQty(productId, variantId, color, wrap, ribbon, delta) {
    var lines = getCart();
    lines = lines
      .map(function (l) {
        if (
          l.productId === productId &&
          l.variantId === variantId &&
          (l.color || "") === (color || "") &&
          (l.wrap || "") === (wrap || "") &&
          (l.ribbon || "") === (ribbon || "")
        ) {
          return Object.assign({}, l, { qty: l.qty + delta });
        }
        return l;
      })
      .filter(function (l) {
        return l.qty > 0;
      });
    setCart(lines);
  }

  function clearCart() {
    setCart([]);
  }

  function cartTotal(lines) {
    return lines.reduce(function (sum, l) {
      return sum + l.unitPrice * l.qty;
    }, 0);
  }

  function getPromoDiscountAmount(code, productSubtotal) {
    var key = String(code || "").trim().toUpperCase();
    var promo = PROMO_CODES[key];
    if (!promo) return 0;
    if (promo.type === "percent") return Math.round((productSubtotal * promo.value) / 100);
    return Math.round(promo.value || 0);
  }

  function promoValidationPack(code, paymentMethod, productSubtotal) {
    var key = String(code || "").trim().toUpperCase();
    var promo = PROMO_CODES[key];
    if (!promo) return { ok: false, reason: "Promo code not found." };
    var now = new Date();
    if (promo.active === false) return { ok: false, reason: "Promo is inactive." };
    if (promo.startAt && now < new Date(promo.startAt)) return { ok: false, reason: "Promo schedule has not started." };
    if (promo.endAt && now > new Date(promo.endAt)) return { ok: false, reason: "Promo has expired." };
    if (Number(promo.minSubtotal || 0) > Number(productSubtotal || 0)) return { ok: false, reason: "Minimum subtotal not reached." };
    if (Array.isArray(promo.allowedPayments) && promo.allowedPayments.length) {
      if (promo.allowedPayments.indexOf(String(paymentMethod || "").toLowerCase()) === -1) {
        return { ok: false, reason: "Promo not allowed for selected payment method." };
      }
    }
    return { ok: true, promo: promo, key: key };
  }

  function makeOrderRef() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    var r = Math.random().toString(36).slice(2, 6).toUpperCase();
    return "SSF-" + y + m + day + "-" + r;
  }

  function paymentFollowUp(method, orderRef, totalStr) {
    if (method === "cod") {
      return (
        "Payment: Cash on delivery.\n" +
        "Please prepare the exact amount (₱" +
        totalStr +
        ") and keep your phone on—our team will contact you to confirm delivery."
      );
    }
    if (method === "gcash") {
      return (
        "Payment: GCash\n" +
        "Send ₱" +
        totalStr +
        " to GCash " +
        SHOP_GCASH_NUMBER +
        ".\n" +
        "Use reference / message: " +
        orderRef +
        ".\n" +
        "After sending, wait for our SMS/messenger confirmation before delivery is scheduled."
      );
    }
    return "We will message you with payment details for " + method + ".";
  }

  function getAuthFormEls() {
    return {
      openBtn: document.getElementById("auth-open"),
      logoutBtn: document.getElementById("auth-logout"),
      status: document.getElementById("auth-status"),
      adminPill: document.getElementById("admin-pill"),
      dialog: document.getElementById("auth-dialog"),
      backdrop: document.getElementById("auth-backdrop"),
      form: document.getElementById("auth-form"),
      message: document.getElementById("auth-message"),
      loginBtn: document.getElementById("auth-login-btn"),
      registerBtn: document.getElementById("auth-register-btn"),
      cancelBtn: document.getElementById("auth-cancel-btn"),
      switchBtn: document.getElementById("auth-switch-btn"),
      switchText: document.getElementById("auth-switch-text"),
      title: document.getElementById("auth-title"),
      registerOnly: document.querySelectorAll(".auth-register-only"),
    };
  }

  function hasFirebaseConfig() {
    return !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.authDomain && FIREBASE_CONFIG.projectId);
  }

  function initFirebase() {
    if (!hasFirebaseConfig() || !window.firebase) return false;
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    fbAuth = firebase.auth();
    fbDb = firebase.database();
    if (firebase.analytics && FIREBASE_CONFIG.measurementId) {
      try {
        firebase.analytics();
      } catch (e) {}
    }
    firebaseReady = true;
    return true;
  }

  function loadProductsFromRealtimeDb() {
    if (!firebaseReady || !fbDb) return Promise.resolve();
    return fbDb
      .ref("products")
      .get()
      .then(function (snap) {
        if (!snap.exists()) return;
        var val = snap.val();
        var list = Array.isArray(val)
          ? val.filter(Boolean)
          : Object.keys(val || {}).map(function (k) {
              return val[k];
            });
        var cleaned = list.filter(function (p) {
          return p && p.id && p.title && Array.isArray(p.images) && Array.isArray(p.variants);
        });
        if (cleaned.length) PRODUCTS = cleaned.map(normalizeProductRecord);
      })
      .catch(function () {});
  }

  function loadPromosFromRealtimeDb() {
    if (!firebaseReady || !fbDb) return Promise.resolve();
    return fbDb
      .ref("promos")
      .get()
      .then(function (snap) {
        if (!snap.exists()) return;
        var raw = snap.val() || {};
        var mapped = {};
        Object.keys(raw).forEach(function (k) {
          mapped[String(k).toUpperCase()] = raw[k];
        });
        if (Object.keys(mapped).length) PROMO_CODES = mapped;
      })
      .catch(function () {});
  }

  function readLocalAuth() {
    try {
      return JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
    } catch (e) {
      return null;
    }
  }

  function writeLocalAuth(user) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(user || null));
  }

  function setAuthMessage(msg, isError) {
    var els = getAuthFormEls();
    if (!els.message) return;
    els.message.textContent = msg || "";
    els.message.style.color = isError ? "var(--rose-dark)" : "var(--leaf)";
  }

  function notify(type, msg) {
    var el = document.getElementById("app-notice");
    if (!el) return;
    if (noticeTimer) {
      clearTimeout(noticeTimer);
      noticeTimer = null;
    }
    el.hidden = false;
    el.className = "app-notice " + (type === "error" ? "error" : "success");
    el.textContent = msg || "";
    noticeTimer = setTimeout(function () {
      el.hidden = true;
    }, 3200);
  }

  function formatAuthError(err) {
    var code = err && err.code ? String(err.code) : "";
    if (code === "auth/configuration-not-found") return "Authentication is not enabled yet in Firebase Console.";
    if (code === "auth/user-not-found") return "Account not found. Please register first.";
    if (code === "auth/wrong-password" || code === "auth/invalid-credential") return "Incorrect email or password.";
    if (code === "auth/email-already-in-use") return "This email is already registered. Please login.";
    if (code === "auth/too-many-requests") return "Too many attempts. Please try again later.";
    return (err && err.message) || "Authentication failed.";
  }

  function applyCheckoutProfile() {
    var checkoutForm = document.getElementById("checkout-form");
    if (!checkoutForm || !currentUser) return;
    if (currentUser.fullName) checkoutForm.querySelector('[name="name"]').value = currentUser.fullName;
    if (currentUser.email) checkoutForm.querySelector('[name="email"]').value = currentUser.email;
    if (currentUser.phone) checkoutForm.querySelector('[name="phone"]').value = currentUser.phone;
  }

  function updateAuthUi() {
    var els = getAuthFormEls();
    if (!els.status) return;
    var logged = !!(currentUser && currentUser.email);
    var ordersLink = document.getElementById("nav-orders-link");
    var profileLink = document.getElementById("nav-profile-link");
    var adminLink = document.getElementById("nav-admin-link");
    var riderLink = document.getElementById("nav-rider-link");
    var role = logged && currentUser ? currentUser.role : "user";
    els.status.textContent = logged ? currentUser.email : "Guest";
    if (els.openBtn) els.openBtn.hidden = logged;
    if (els.logoutBtn) els.logoutBtn.hidden = !logged;
    if (els.adminPill) els.adminPill.hidden = !(logged && currentUser.role === "admin");
    if (ordersLink) {
      ordersLink.hidden = !logged;
      ordersLink.href = role === "admin" ? "admin-orders.html" : role === "rider" ? "rider-orders.html" : "user-orders.html";
      ordersLink.textContent = role === "admin" ? "Dashboard" : "Orders";
    }
    if (profileLink) profileLink.hidden = !logged;
    if (adminLink) adminLink.hidden = true;
    if (riderLink) riderLink.hidden = true;
    applyCheckoutProfile();
  }

  function openAuthDialog(msg) {
    var els = getAuthFormEls();
    if (!els.dialog || !els.backdrop) return;
    setAuthMode("login");
    if (els.form) els.form.reset();
    els.dialog.hidden = false;
    els.backdrop.hidden = false;
    setAuthMessage(msg || "Please login to continue.", false);
  }

  function closeAuthDialog() {
    var els = getAuthFormEls();
    if (!els.dialog || !els.backdrop) return;
    els.dialog.hidden = true;
    els.backdrop.hidden = true;
  }

  function authFormData() {
    var els = getAuthFormEls();
    var data = new FormData(els.form);
    return {
      fullName: String(data.get("full_name") || "").trim(),
      email: String(data.get("email") || "").trim(),
      phone: String(data.get("phone") || "").replace(/\D/g, "").slice(0, 11),
      password: String(data.get("password") || ""),
    };
  }

  function setAuthMode(mode) {
    authMode = mode === "register" ? "register" : "login";
    var els = getAuthFormEls();
    if (!els.form) return;
    var isRegister = authMode === "register";
    if (els.title) els.title.textContent = isRegister ? "Create Account" : "Welcome Back";
    if (els.loginBtn) els.loginBtn.hidden = isRegister;
    if (els.registerBtn) els.registerBtn.hidden = !isRegister;
    if (els.switchText) els.switchText.textContent = isRegister ? "Already have an account?" : "No account yet?";
    if (els.switchBtn) els.switchBtn.textContent = isRegister ? "Back to login" : "Register here";
    els.registerOnly.forEach(function (el) {
      el.hidden = !isRegister;
      el.style.display = isRegister ? "block" : "none";
      var input = el.querySelector("input");
      if (input) input.required = isRegister;
    });
    setAuthMessage("", false);
  }

  async function registerUser() {
    var pack = authFormData();
    if (!pack.email || !pack.password || !pack.fullName) {
      setAuthMessage("Please fill full name, email, and password.", true);
      return;
    }
    if (pack.phone && !/^09\d{9}$/.test(pack.phone)) {
      setAuthMessage("Mobile must be 11 digits and start with 09.", true);
      return;
    }
    if (isAdminEmail(pack.email) && pack.password !== ADMIN_PASSWORD) {
      setAuthMessage("Invalid admin credentials.", true);
      return;
    }
    if (firebaseReady) {
      var cred = await fbAuth.createUserWithEmailAndPassword(pack.email, pack.password);
      var profile = {
        uid: cred.user.uid,
        fullName: pack.fullName,
        email: pack.email,
        phone: pack.phone,
        role: getRoleFromEmail(pack.email),
      };
      await fbDb.ref("profiles/" + cred.user.uid).set(profile);
      currentUser = profile;
    } else {
      currentUser = {
        uid: "local-user",
        fullName: pack.fullName,
        email: pack.email,
        phone: pack.phone,
        role: getRoleFromEmail(pack.email),
      };
      writeLocalAuth(currentUser);
    }
    updateAuthUi();
    setAuthMessage("Registered successfully.", false);
    notify("success", "Account created successfully.");
    closeAuthDialog();
  }

  async function loginUser() {
    var pack = authFormData();
    if (!pack.email || !pack.password) {
      setAuthMessage("Please enter email and password.", true);
      return;
    }
    if (isAdminEmail(pack.email) && pack.password !== ADMIN_PASSWORD) {
      setAuthMessage("Invalid admin credentials.", true);
      return;
    }
    if (firebaseReady) {
      var cred = await fbAuth.signInWithEmailAndPassword(pack.email, pack.password);
      var profileSnap = await fbDb.ref("profiles/" + cred.user.uid).get();
      var profile = profileSnap.exists() ? profileSnap.val() : {};
      if (!profile || !profile.uid) {
        profile = {
          uid: cred.user.uid,
          fullName: cred.user.displayName || "",
          email: cred.user.email || pack.email,
          phone: "",
          role: getRoleFromEmail(cred.user.email || pack.email),
          createdAt: new Date().toISOString(),
        };
        await fbDb.ref("profiles/" + cred.user.uid).set(profile);
      }
      currentUser = {
        uid: cred.user.uid,
        fullName: profile.fullName || cred.user.displayName || "",
        email: cred.user.email || pack.email,
        phone: profile.phone || "",
        role: profile.role || getRoleFromEmail(cred.user.email || pack.email),
      };
    } else {
      currentUser = readLocalAuth();
      if (!currentUser || currentUser.email !== pack.email) {
        setAuthMessage("No local account found. Register first or set Firebase config.", true);
        return;
      }
    }
    updateAuthUi();
    notify("success", "Login successful.");
    closeAuthDialog();
  }

  async function logoutUser() {
    if (firebaseReady && fbAuth) await fbAuth.signOut();
    currentUser = null;
    writeLocalAuth(null);
    updateAuthUi();
  }

  function initAuthUi() {
    initFirebase();
    var els = getAuthFormEls();
    if (!els.openBtn) return;

    els.openBtn.addEventListener("click", function () {
      openAuthDialog(firebaseReady ? "Please login to continue." : "Please login to continue.");
    });
    els.cancelBtn.addEventListener("click", closeAuthDialog);
    els.backdrop.addEventListener("click", closeAuthDialog);
    els.logoutBtn.addEventListener("click", function () {
      logoutUser().catch(function (e) {
        alert("Logout failed: " + (e && e.message ? e.message : e));
      });
    });
    els.loginBtn.addEventListener("click", function () {
      loginUser().catch(function (e) {
        setAuthMessage(formatAuthError(e), true);
        notify("error", formatAuthError(e));
      });
    });
    els.registerBtn.addEventListener("click", function () {
      registerUser().catch(function (e) {
        setAuthMessage(formatAuthError(e), true);
        notify("error", formatAuthError(e));
      });
    });
    if (els.switchBtn) {
      els.switchBtn.addEventListener("click", function () {
        setAuthMode(authMode === "login" ? "register" : "login");
      });
    }

    if (firebaseReady && fbAuth) {
      fbAuth.onAuthStateChanged(function (user) {
        if (!user) {
          currentUser = null;
          updateAuthUi();
          return;
        }
        fbDb
          .ref("profiles/" + user.uid)
          .get()
          .then(async function (snap) {
            var profile = snap.exists() ? snap.val() : {};
            if (!profile || !profile.uid) {
              profile = {
                uid: user.uid,
                fullName: user.displayName || "",
                email: user.email || "",
                phone: "",
                role: getRoleFromEmail(user.email),
                createdAt: new Date().toISOString(),
              };
              await fbDb.ref("profiles/" + user.uid).set(profile);
            }
            currentUser = {
              uid: user.uid,
              fullName: profile.fullName || user.displayName || "",
              email: user.email || "",
              phone: profile.phone || "",
              role: profile.role || getRoleFromEmail(user.email),
            };
            updateAuthUi();
          });
      });
    } else {
      currentUser = readLocalAuth();
      updateAuthUi();
    }
  }

  function initShowcaseCarousel() {
    var imageEl = document.getElementById("showcase-image");
    var dotsEl = document.getElementById("showcase-dots");
    var prevBtn = document.getElementById("showcase-prev");
    var nextBtn = document.getElementById("showcase-next");
    if (!imageEl || !dotsEl || !prevBtn || !nextBtn) return;
    var slides = [];
    PRODUCTS.forEach(function (p) {
      p.images.forEach(function (img, idx) {
        slides.push({ src: resolveImageSrc(img), alt: p.title + " — photo " + (idx + 1) });
      });
    });
    if (!slides.length) return;
    var index = 0;
    var timer = null;
    function render(i) {
      index = (i + slides.length) % slides.length;
      imageEl.src = slides[index].src;
      imageEl.alt = slides[index].alt;
      dotsEl.innerHTML = "";
      slides.forEach(function (_, j) {
        var d = document.createElement("span");
        d.className = "gallery-dot" + (j === index ? " active" : "");
        dotsEl.appendChild(d);
      });
    }
    function start() {
      if (timer || slides.length < 2) return;
      timer = setInterval(function () {
        render(index + 1);
      }, 2200);
    }
    function stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    }
    prevBtn.addEventListener("click", function () {
      render(index - 1);
    });
    nextBtn.addEventListener("click", function () {
      render(index + 1);
    });
    imageEl.addEventListener("mouseenter", stop);
    imageEl.addEventListener("mouseleave", start);
    render(Math.floor(Math.random() * slides.length));
    start();
  }

  function initDiscountCarousel() {
    var imageEl = document.getElementById("discount-image");
    var dotsEl = document.getElementById("discount-dots");
    var prevBtn = document.getElementById("discount-prev");
    var nextBtn = document.getElementById("discount-next");
    if (!imageEl || !dotsEl || !prevBtn || !nextBtn) return;
    var slides = [
      { src: "assets/images/discount-1.jpg", alt: "Discount banner 1" },
      { src: "assets/images/discount-2.jpg", alt: "Discount banner 2" },
      { src: "assets/images/discount-3.jpg", alt: "Discount banner 3" },
      { src: "assets/images/discount-4.jpg", alt: "Discount banner 4" },
    ];
    var index = 0;
    var timer = null;
    function render(i) {
      index = (i + slides.length) % slides.length;
      imageEl.src = slides[index].src;
      imageEl.alt = slides[index].alt;
      dotsEl.innerHTML = "";
      slides.forEach(function (_, j) {
        var d = document.createElement("span");
        d.className = "gallery-dot" + (j === index ? " active" : "");
        dotsEl.appendChild(d);
      });
    }
    function start() {
      if (timer || slides.length < 2) return;
      timer = setInterval(function () {
        render(index + 1);
      }, 2600);
    }
    function stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    }
    prevBtn.addEventListener("click", function () {
      render(index - 1);
    });
    nextBtn.addEventListener("click", function () {
      render(index + 1);
    });
    imageEl.addEventListener("mouseenter", stop);
    imageEl.addEventListener("mouseleave", start);
    render(0);
    start();
  }

  var selectedVariant = {};
  var selectedChoices = {};

  function optionLabel(type) {
    if (type === "color") return "Pick flower color";
    if (type === "wrap") return "Pick wrap";
    if (type === "ribbon") return "Pick ribbon";
    return "Pick option";
  }

  function buildChoiceChips(host, type, values, productId) {
    if (!values || !values.length) {
      host.classList.add("hidden");
      host.innerHTML = "";
      return;
    }
    host.classList.remove("hidden");
    host.innerHTML = "";
    var lbl = document.createElement("span");
    lbl.className = "variant-label";
    lbl.textContent = optionLabel(type);
    var opts = document.createElement("div");
    opts.className = "variant-options";
    if (!selectedChoices[productId]) selectedChoices[productId] = {};
    selectedChoices[productId][type] = selectedChoices[productId][type] || values[0];
    values.forEach(function (v) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "variant-chip" + (selectedChoices[productId][type] === v ? " selected" : "");
      b.textContent = v;
      b.addEventListener("click", function () {
        selectedChoices[productId][type] = v;
        opts.querySelectorAll(".variant-chip").forEach(function (c) {
          c.classList.toggle("selected", c === b);
        });
      });
      opts.appendChild(b);
    });
    host.appendChild(lbl);
    host.appendChild(opts);
  }

  function renderProducts() {
    var root = document.getElementById("products");
    var tpl = document.getElementById("product-card-template");
    root.innerHTML = "";

    PRODUCTS.filter(function (p) {
      return !p.isDeleted && !p.hidden;
    }).forEach(function (p) {
      var node = tpl.content.firstElementChild.cloneNode(true);
      var gallery = node.querySelector(".product-gallery");
      var imgEl = node.querySelector(".product-image");
      var dotsWrap = node.querySelector(".gallery-dots");
      var titleEl = node.querySelector(".product-title");
      var descEl = node.querySelector(".product-desc");
      var priceWrap = node.querySelector(".product-price-wrap");
      var pricePrefix = node.querySelector(".price-prefix");
      var priceEl = node.querySelector(".product-price");
      var addBtn = node.querySelector(".add-cart");
      var variantWrap = node.querySelector(".product-variant-wrap");
      var colorWrap = node.querySelector('.product-option-wrap[data-option-type="color"]');
      var wrapWrap = node.querySelector('.product-option-wrap[data-option-type="wrap"]');
      var ribbonWrap = node.querySelector('.product-option-wrap[data-option-type="ribbon"]');

      titleEl.textContent = p.title;
      descEl.textContent = p.description;

      var minPrice = Math.min.apply(
        null,
        p.variants.map(function (v) {
          return v.price;
        })
      );
      priceEl.textContent = formatPHP(minPrice);
      if (p.variants.length > 1) {
        pricePrefix.style.display = "inline";
        pricePrefix.textContent = "From ";
      } else {
        pricePrefix.style.display = "none";
      }

      if (p.variants.length > 1) {
        variantWrap.classList.remove("hidden");
        var lbl = document.createElement("span");
        lbl.className = "variant-label";
        lbl.textContent = "Choose stems";
        var opts = document.createElement("div");
        opts.className = "variant-options";
        selectedVariant[p.id] = p.variants[0].id;

        p.variants.forEach(function (v, i) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "variant-chip" + (i === 0 ? " selected" : "");
          b.textContent = v.short + " • " + formatPHP(v.price);
          b.dataset.variantId = v.id;
          b.addEventListener("click", function () {
            opts.querySelectorAll(".variant-chip").forEach(function (c) {
              c.classList.toggle("selected", c === b);
            });
            selectedVariant[p.id] = v.id;
            priceEl.textContent = formatPHP(v.price);
          });
          opts.appendChild(b);
        });

        variantWrap.innerHTML = "";
        variantWrap.appendChild(lbl);
        variantWrap.appendChild(opts);
      } else {
        selectedVariant[p.id] = p.variants[0].id;
      }

      if (!selectedChoices[p.id]) selectedChoices[p.id] = {};
      buildChoiceChips(colorWrap, "color", p.options && p.options.colors, p.id);
      buildChoiceChips(wrapWrap, "wrap", p.options && p.options.wraps, p.id);
      buildChoiceChips(ribbonWrap, "ribbon", p.options && p.options.ribbons, p.id);

      var index = 0;
      var hoverTimer = null;
      var hoverDelayMs = 1100;

      function stopHoverPreview(resetToFirst) {
        if (hoverTimer) {
          clearInterval(hoverTimer);
          hoverTimer = null;
        }
        if (resetToFirst) {
          showIndex(0);
        }
      }

      function startHoverPreview() {
        if (p.images.length < 2 || hoverTimer) return;
        hoverTimer = setInterval(function () {
          showIndex(index + 1);
        }, hoverDelayMs);
      }

      function showIndex(i) {
        index = (i + p.images.length) % p.images.length;
        var src = p.images[index];
        imgEl.src = p.externalImage ? src : resolveImageSrc(src);
        imgEl.alt = p.title + " — photo " + (index + 1);
        dotsWrap.innerHTML = "";
        if (p.images.length > 1) {
          p.images.forEach(function (_, j) {
            var d = document.createElement("span");
            d.className = "gallery-dot" + (j === index ? " active" : "");
            dotsWrap.appendChild(d);
          });
        }
      }

      showIndex(0);

      var prevBtn = gallery.querySelector(".prev");
      var nextBtn = gallery.querySelector(".next");
      if (p.images.length < 2) {
        prevBtn.hidden = true;
        nextBtn.hidden = true;
        dotsWrap.innerHTML = "";
      } else {
        prevBtn.hidden = false;
        nextBtn.hidden = false;
        prevBtn.onclick = function () {
          showIndex(index - 1);
        };
        nextBtn.onclick = function () {
          showIndex(index + 1);
        };

        // On hover/focus, preview other color/style photos for this same product.
        node.addEventListener("mouseenter", startHoverPreview);
        node.addEventListener("mouseleave", function () {
          stopHoverPreview(true);
        });
        node.addEventListener("focusin", startHoverPreview);
        node.addEventListener("focusout", function (ev) {
          if (!node.contains(ev.relatedTarget)) {
            stopHoverPreview(true);
          }
        });
      }

      addBtn.addEventListener("click", function () {
        if (p.outOfStock) return;
        var vid = selectedVariant[p.id] || p.variants[0].id;
        addToCart(p.id, vid, {
          color: selectedChoices[p.id].color || "",
          wrap: selectedChoices[p.id].wrap || "",
          ribbon: selectedChoices[p.id].ribbon || "",
        });
      });
      if (p.outOfStock) {
        addBtn.disabled = true;
        addBtn.textContent = "Out of stock";
      } else {
        addBtn.disabled = false;
        addBtn.textContent = "Add to cart";
      }

      root.appendChild(node);
    });
  }

  function renderCart() {
    var lines = getCart();
    var count = lines.reduce(function (n, l) {
      return n + l.qty;
    }, 0);
    document.getElementById("cart-count").textContent = String(count);
    document.getElementById("cart-total").textContent = formatPHP(cartTotal(lines));

    var host = document.getElementById("cart-lines");
    host.innerHTML = "";

    if (!lines.length) {
      var p = document.createElement("p");
      p.className = "empty-cart-msg";
      p.textContent = "Your cart is empty. Add a bouquet from the shop.";
      host.appendChild(p);
      return;
    }

    lines.forEach(function (l) {
      var row = document.createElement("div");
      row.className = "cart-line";

      var thumb = document.createElement("img");
      thumb.src = l.image;
      thumb.alt = "";

      var mid = document.createElement("div");
      var h4 = document.createElement("h4");
      h4.textContent = l.title;
      var v = document.createElement("p");
      v.className = "variant";
      var details = [l.variantLabel];
      if (l.color) details.push("Color: " + l.color);
      if (l.wrap) details.push("Wrap: " + l.wrap);
      if (l.ribbon) details.push("Ribbon: " + l.ribbon);
      v.textContent = details.join(" • ");

      var qtyRow = document.createElement("div");
      qtyRow.className = "qty-row";
      var minus = document.createElement("button");
      minus.type = "button";
      minus.textContent = "−";
      minus.setAttribute("aria-label", "Decrease quantity");
      var num = document.createElement("span");
      num.textContent = String(l.qty);
      var plus = document.createElement("button");
      plus.type = "button";
      plus.textContent = "+";
      plus.setAttribute("aria-label", "Increase quantity");

      minus.addEventListener("click", function () {
        updateQty(l.productId, l.variantId, l.color, l.wrap, l.ribbon, -1);
      });
      plus.addEventListener("click", function () {
        updateQty(l.productId, l.variantId, l.color, l.wrap, l.ribbon, 1);
      });

      qtyRow.appendChild(minus);
      qtyRow.appendChild(num);
      qtyRow.appendChild(plus);

      mid.appendChild(h4);
      mid.appendChild(v);
      mid.appendChild(qtyRow);

      var price = document.createElement("div");
      price.className = "line-price";
      price.textContent = formatPHP(l.unitPrice * l.qty);

      row.appendChild(thumb);
      row.appendChild(mid);
      row.appendChild(price);
      host.appendChild(row);
    });
  }

  function openCart() {
    var panel = document.getElementById("cart-panel");
    panel.hidden = false;
    document.getElementById("cart-toggle").setAttribute("aria-expanded", "true");
  }

  function closeCart() {
    var panel = document.getElementById("cart-panel");
    panel.hidden = true;
    document.getElementById("cart-toggle").setAttribute("aria-expanded", "false");
  }

  var checkoutAddrCtl = null;

  function openCheckout() {
    var lines = getCart();
    if (!lines.length) {
      alert("Your cart is empty.");
      return;
    }
    if (!currentUser || !currentUser.email) {
      openAuthDialog("Please login/register first before checkout.");
      return;
    }
    document.getElementById("checkout-backdrop").hidden = false;
    document.getElementById("checkout-dialog").hidden = false;
    closeCart();
    applyCheckoutProfile();
    if (checkoutAddrCtl && checkoutAddrCtl.refresh) checkoutAddrCtl.refresh();
  }

  function closeCheckout() {
    document.getElementById("checkout-backdrop").hidden = true;
    document.getElementById("checkout-dialog").hidden = true;
  }

  document.getElementById("cart-toggle").addEventListener("click", function () {
    var panel = document.getElementById("cart-panel");
    if (panel.hidden) openCart();
    else closeCart();
  });
  document.getElementById("cart-close").addEventListener("click", closeCart);
  document.getElementById("cart-scrim").addEventListener("click", closeCart);
  document.getElementById("cart-clear").addEventListener("click", function () {
    if (getCart().length && confirm("Clear all items from your cart?")) clearCart();
  });
  document.getElementById("checkout-open").addEventListener("click", openCheckout);
  document.getElementById("checkout-cancel").addEventListener("click", closeCheckout);
  document.getElementById("checkout-backdrop").addEventListener("click", closeCheckout);

  function selectLabel(sel) {
    if (!sel || sel.selectedIndex < 0) return "";
    var o = sel.options[sel.selectedIndex];
    return o && o.value ? o.textContent.trim() : "";
  }

  var checkoutForm = document.getElementById("checkout-form");
  if (checkoutForm) {
    var payInputs = checkoutForm.querySelectorAll('input[name="payment"]');
    var ewalletExtra = checkoutForm.querySelector(".checkout-ewallet-extra");
    var promoInput = checkoutForm.querySelector('input[name="promo_code"]');
    var promoApplyBtn = document.getElementById("promo-apply-btn");
    var promoFeedback = document.getElementById("promo-feedback");
    enforceNumericInput(checkoutForm);

    checkoutAddrCtl =
      typeof window.initPhilippinesAddressPickers === "function"
        ? window.initPhilippinesAddressPickers(checkoutForm, {
            totalsPanel: document.getElementById("checkout-totals"),
            getProductSubtotal: function () {
              return cartTotal(getCart());
            },
            formatPHP: formatPHP,
          })
        : null;

    var phoneEl = checkoutForm.querySelector('[name="phone"]');
    if (phoneEl) {
      phoneEl.addEventListener("input", function () {
        phoneEl.value = phoneEl.value.replace(/\D/g, "").slice(0, 11);
      });
    }

    function syncPaymentUi() {
      var method = checkoutForm.querySelector('input[name="payment"]:checked');
      var m = method ? method.value : "cod";
      if (ewalletExtra) ewalletExtra.hidden = m === "cod";
    }

    function updateCheckoutGrandWithPromo(deliveryFee) {
      var panel = document.getElementById("checkout-totals");
      if (!panel) return;
      var prodSub = cartTotal(getCart());
      var discountRow = panel.querySelector(".js-sub-discount");
      var grandRow = panel.querySelector(".js-grand-total");
      var payMethod = checkoutForm.querySelector('input[name="payment"]:checked');
      var selectedPay = payMethod ? payMethod.value : "cod";
      var p = activePromo ? promoValidationPack(activePromo, selectedPay, prodSub) : { ok: false };
      var discount = p.ok ? getPromoDiscountAmount(activePromo, prodSub) : 0;
      discount = Math.min(discount, prodSub);
      if (discountRow) discountRow.textContent = formatPHP(discount);
      if (grandRow) grandRow.textContent = formatPHP(prodSub - discount + Math.max(0, Number(deliveryFee || 0)));
    }

    payInputs.forEach(function (el) {
      el.addEventListener("change", function () {
        syncPaymentUi();
        updateCheckoutGrandWithPromo(checkoutAddrCtl && checkoutAddrCtl.getTotals ? checkoutAddrCtl.getTotals().deliveryFee : 0);
      });
    });
    syncPaymentUi();
    if (promoApplyBtn) {
      promoApplyBtn.addEventListener("click", function () {
        var key = String((promoInput && promoInput.value) || "").trim().toUpperCase();
        if (!key) {
          activePromo = null;
          if (promoFeedback) promoFeedback.textContent = "No promo applied.";
          updateCheckoutGrandWithPromo(checkoutAddrCtl && checkoutAddrCtl.getTotals ? checkoutAddrCtl.getTotals().deliveryFee : 0);
          return;
        }
        if (!PROMO_CODES[key]) {
          activePromo = null;
          if (promoFeedback) promoFeedback.textContent = "Promo code not found.";
          updateCheckoutGrandWithPromo(checkoutAddrCtl && checkoutAddrCtl.getTotals ? checkoutAddrCtl.getTotals().deliveryFee : 0);
          return;
        }
        var payMethod = checkoutForm.querySelector('input[name="payment"]:checked');
        var selectedPay = payMethod ? payMethod.value : "cod";
        var result = promoValidationPack(key, selectedPay, cartTotal(getCart()));
        if (!result.ok) {
          activePromo = null;
          if (promoFeedback) promoFeedback.textContent = result.reason;
          updateCheckoutGrandWithPromo(checkoutAddrCtl && checkoutAddrCtl.getTotals ? checkoutAddrCtl.getTotals().deliveryFee : 0);
          return;
        }
        activePromo = result.key;
        if (promoFeedback) promoFeedback.textContent = "Promo applied: " + result.key;
        updateCheckoutGrandWithPromo(checkoutAddrCtl && checkoutAddrCtl.getTotals ? checkoutAddrCtl.getTotals().deliveryFee : 0);
      });
    }

    checkoutForm.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var form = ev.target;
      var data = new FormData(form);
      var pay = data.get("payment") || "cod";
      var orderRef = makeOrderRef();

      var phoneDigits = String(data.get("phone") || "").replace(/\D/g, "");
      if (!/^09\d{9}$/.test(phoneDigits)) {
        alert("Please enter a valid Philippine mobile number: 09 + 9 digits (numbers only).");
        return;
      }

      if (!checkoutAddrCtl) {
        alert(
          "Address picker did not load. Check that js/ph-address.js is on the server and refresh the page (needed for Philippine delivery fees)."
        );
        return;
      }

      var feePack = checkoutAddrCtl.getTotals();

      if (!feePack.addressComplete) {
        alert("Please finish your Philippine address: region, province (if applicable), city, barangay, and street/building.");
        return;
      }

      var prodSub = cartTotal(getCart());
      var deliveryFee = feePack.deliveryFee;
      var promoPack = activePromo ? promoValidationPack(activePromo, pay, prodSub) : { ok: false };
      var discount = promoPack.ok ? getPromoDiscountAmount(activePromo, prodSub) : 0;
      discount = Math.min(discount, prodSub);
      var grandNum = prodSub - discount + deliveryFee;
      var grandStr = grandNum.toLocaleString("en-PH");

      var selRegion = checkoutForm.querySelector("#addr-region");
      var selProv = checkoutForm.querySelector("#addr-province");
      var selCity = checkoutForm.querySelector("#addr-city");
      var selBrgy = checkoutForm.querySelector("#addr-barangay");
      var ncr =
        typeof window.PH_ADDRESS_API !== "undefined" &&
        selRegion &&
        selRegion.value === window.PH_ADDRESS_API.ncrCode;

      var provinceLine = ncr ? "National Capital Region" : selectLabel(selProv);

      if (pay === "gcash") {
        var gcashResult = await runGcashDemoTimer();
        if (gcashResult === "cancel") {
          notify("error", "Order cancelled before payment confirmation.");
          return;
        }
      }

      var snapshot = {
        orderRef: orderRef,
        placedAt: new Date().toISOString(),
        status: pay === "gcash" ? ORDER_STATUSES.AWAITING_PAYMENT_REVIEW : ORDER_STATUSES.PENDING,
        statusHistory: [
          {
            status: pay === "gcash" ? ORDER_STATUSES.AWAITING_PAYMENT_REVIEW : ORDER_STATUSES.PENDING,
            at: new Date().toISOString(),
          },
        ],
        account: currentUser
          ? {
              uid: currentUser.uid || "",
              email: currentUser.email || "",
              role: currentUser.role || "user",
            }
          : null,
        payment: pay,
        ewalletRef: (data.get("ewallet_ref") || "").trim(),
        customer: {
          name: data.get("name"),
          email: data.get("email"),
          phone: phoneDigits,
          notes: (data.get("notes") || "").trim(),
        },
        deliveryAddress: {
          regionCode: selRegion ? selRegion.value : "",
          region: selectLabel(selRegion),
          province: provinceLine,
          city: selectLabel(selCity),
          barangay: selectLabel(selBrgy),
          street: (data.get("addr_street") || "").trim(),
        },
        lines: getCart(),
        promoCode: promoPack.ok ? activePromo : "",
        discountAmount: discount,
        agreement: {
          accepted: true,
          acceptedAt: new Date().toISOString(),
          legalVersion: LEGAL_VERSION,
          termsVersion: "SSF-LEGAL-v1.0",
          privacyVersion: "SSF-PRIVACY-v1.0",
          refundVersion: "SSF-REFUND-v1.0",
          policyRecords: {
            termsUrl: "terms.html",
            privacyUrl: "privacy.html",
            refundUrl: "refund-policy.html",
          },
        },
        productSubtotal: prodSub,
        deliveryFee: deliveryFee,
        total: grandNum,
      };

      console.log("[Sweet Surprise Flowershop order]", snapshot);
      if (firebaseReady && fbDb && currentUser && currentUser.uid) {
        try {
          await fbDb.ref("orders/" + currentUser.uid + "/" + orderRef).set(snapshot);
          await fbDb.ref("orders_by_ref/" + orderRef).set(snapshot);
        } catch (e) {}
      }
      try {
        var prev = JSON.parse(localStorage.getItem("ssf-orders-demo") || "[]");
        prev.push(snapshot);
        localStorage.setItem("ssf-orders-demo", JSON.stringify(prev));
      } catch (e) {}

      if (pay === "gcash") {
        alert("Payment submitted. Please wait for owner/admin payment confirmation. Updates will appear in your order dashboard.");
      }

      var follow = paymentFollowUp(pay, orderRef, grandStr);
      notify("success", "Order placed. " + follow);
      clearCart();
      closeCheckout();
      form.reset();
      activePromo = null;
      if (promoFeedback) promoFeedback.textContent = "";
      syncPaymentUi();
      if (checkoutAddrCtl && checkoutAddrCtl.reset) checkoutAddrCtl.reset();
      openReceiptDialog(snapshot, feePack);
    });
  }

  function setSectionVisible(el, visible) {
    if (!el) return;
    el.hidden = !visible;
    if (visible) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function enforceNumericInput(root) {
    if (!root) return;
    root.querySelectorAll('input[data-numeric-only="true"]').forEach(function (input) {
      input.addEventListener("input", function () {
        input.value = input.value.replace(/\D/g, "");
      });
    });
  }

  function closeReceiptDialog() {
    var backdrop = document.getElementById("receipt-backdrop");
    var dialog = document.getElementById("receipt-dialog");
    if (backdrop) backdrop.hidden = true;
    if (dialog) dialog.hidden = true;
  }

  function runGcashDemoTimer() {
    return new Promise(function (resolve) {
      var backdrop = document.getElementById("gcash-backdrop");
      var dialog = document.getElementById("gcash-dialog");
      var doneBtn = document.getElementById("gcash-done-btn");
      var cancelBtn = document.getElementById("gcash-cancel-btn");
      var qrImage = document.getElementById("gcash-qr-image");
      if (!backdrop || !dialog || !doneBtn || !cancelBtn) {
        resolve();
        return;
      }
      var settled = false;
      if (qrImage) qrImage.src = "assets/gcash-qr/qr.png";
      backdrop.hidden = false;
      dialog.hidden = false;
      function finish(state) {
        if (settled) return;
        settled = true;
        doneBtn.removeEventListener("click", onDone);
        cancelBtn.removeEventListener("click", onCancel);
        dialog.hidden = true;
        backdrop.hidden = true;
        resolve(state);
      }
      function onDone() {
        finish("done");
      }
      function onCancel() {
        finish("cancel");
      }
      doneBtn.addEventListener("click", onDone);
      cancelBtn.addEventListener("click", onCancel);
    });
  }

  function openReceiptDialog(snapshot, feePack) {
    var backdrop = document.getElementById("receipt-backdrop");
    var dialog = document.getElementById("receipt-dialog");
    var host = document.getElementById("receipt-content");
    if (!backdrop || !dialog || !host) return;
    var lines = snapshot.lines || [];
    var itemsHtml = lines
      .map(function (line) {
        return "<li>" + line.title + " x" + line.qty + " (" + formatPHP(line.unitPrice * line.qty) + ")</li>";
      })
      .join("");
    var farText = feePack && feePack.farNote ? '<p class="muted small">Note: ' + feePack.farNote + "</p>" : "";
    host.innerHTML =
      '<div class="receipt-row"><strong>Order Ref</strong><span>' +
      snapshot.orderRef +
      "</span></div>" +
      '<div class="receipt-row"><strong>Name</strong><span>' +
      snapshot.customer.name +
      "</span></div>" +
      '<div class="receipt-row"><strong>Payment</strong><span>' +
      String(snapshot.payment || "cod").toUpperCase() +
      "</span></div>" +
      '<div class="receipt-row"><strong>Bouquets</strong><span>' +
      formatPHP(snapshot.productSubtotal || 0) +
      "</span></div>" +
      '<div class="receipt-row"><strong>Discount</strong><span>-' +
      formatPHP(snapshot.discountAmount || 0) +
      "</span></div>" +
      '<div class="receipt-row"><strong>Delivery Fee</strong><span>' +
      formatPHP(snapshot.deliveryFee || 0) +
      "</span></div>" +
      '<div class="receipt-row"><strong>Total</strong><strong>' +
      formatPHP(snapshot.total || 0) +
      "</strong></div>" +
      '<p class="muted small">Status: Pending approval</p>' +
      '<p class="muted small">Please wait for confirmation. We will contact you via your phone number and email once approved/out for delivery.</p>' +
      '<ul class="receipt-lines">' +
      itemsHtml +
      "</ul>" +
      farText;
    backdrop.hidden = false;
    dialog.hidden = false;
  }

  function renderOrderList(host, orders, includeActions) {
    if (!host) return;
    host.innerHTML = "";
    if (!orders.length) {
      var empty = document.createElement("p");
      empty.className = "muted small";
      empty.textContent = "No orders yet.";
      host.appendChild(empty);
      return;
    }
    orders.forEach(function (o) {
      var card = document.createElement("article");
      card.className = "order-card";

      var top = document.createElement("div");
      top.className = "order-card-top";
      var title = document.createElement("strong");
      title.textContent = o.orderRef;
      var pill = document.createElement("span");
      pill.className = "status-pill " + statusClass(o.status);
      pill.textContent = prettyStatus(o.status);
      top.appendChild(title);
      top.appendChild(pill);

      var meta = document.createElement("p");
      meta.className = "order-meta muted small";
      meta.textContent =
        "Customer: " +
        (o.customer && o.customer.name ? o.customer.name : "N/A") +
        " • Payment: " +
        String(o.payment || "cod").toUpperCase() +
        " • Total: " +
        formatPHP(Number(o.total || 0));

      var lines = document.createElement("ul");
      lines.className = "order-lines small";
      (o.lines || []).forEach(function (line) {
        var li = document.createElement("li");
        li.textContent = line.title + " x" + line.qty;
        lines.appendChild(li);
      });

      card.appendChild(top);
      card.appendChild(meta);
      card.appendChild(lines);

      if (includeActions) {
        var actions = document.createElement("div");
        actions.className = "order-actions";
        if (o.status === ORDER_STATUSES.PENDING) {
          var approveBtn = document.createElement("button");
          approveBtn.type = "button";
          approveBtn.className = "primary";
          approveBtn.textContent = "Approve order";
          approveBtn.addEventListener("click", function () {
            updateOrderStatus(o, ORDER_STATUSES.APPROVED);
          });
          actions.appendChild(approveBtn);
        }
        if (o.status === ORDER_STATUSES.APPROVED) {
          var shipBtn = document.createElement("button");
          shipBtn.type = "button";
          shipBtn.className = "ghost";
          shipBtn.textContent = "Out for delivery";
          shipBtn.addEventListener("click", function () {
            updateOrderStatus(o, ORDER_STATUSES.OUT_FOR_DELIVERY);
          });
          actions.appendChild(shipBtn);
        }
        if (o.status === ORDER_STATUSES.OUT_FOR_DELIVERY) {
          var deliveredBtn = document.createElement("button");
          deliveredBtn.type = "button";
          deliveredBtn.className = "ghost";
          deliveredBtn.textContent = "Mark delivered";
          deliveredBtn.addEventListener("click", function () {
            updateOrderStatus(o, ORDER_STATUSES.DELIVERED);
          });
          actions.appendChild(deliveredBtn);
        }
        if (!actions.children.length) {
          var done = document.createElement("span");
          done.className = "small muted";
          done.textContent = "No actions needed.";
          actions.appendChild(done);
        }
        card.appendChild(actions);
      }

      host.appendChild(card);
    });
  }

  async function loadUserOrders() {
    var host = document.getElementById("user-orders-list");
    if (!host) return;
    if (!currentUser || !currentUser.uid) {
      renderOrderList(host, [], false);
      return;
    }
    var orders = [];
    if (firebaseReady && fbDb) {
      try {
        var snap = await fbDb.ref("orders/" + currentUser.uid).get();
        var raw = snap.exists() ? snap.val() : {};
        Object.keys(raw || {}).forEach(function (key) {
          orders.push(normalizeOrder(raw[key], key));
        });
      } catch (e) {}
    }
    if (!orders.length) {
      try {
        var local = JSON.parse(localStorage.getItem("ssf-orders-demo") || "[]");
        orders = (local || [])
          .filter(function (o) {
            return o && o.account && o.account.uid === currentUser.uid;
          })
          .map(function (o) {
            return normalizeOrder(o, o.orderRef);
          });
      } catch (e) {}
    }
    orders.sort(function (a, b) {
      return new Date(b.placedAt || 0).getTime() - new Date(a.placedAt || 0).getTime();
    });
    renderOrderList(host, orders, false);
  }

  async function loadAdminOrders() {
    var host = document.getElementById("admin-orders-list");
    if (!host) return;
    if (!currentUser || currentUser.role !== "admin") {
      renderOrderList(host, [], true);
      return;
    }
    var orders = [];
    if (firebaseReady && fbDb) {
      try {
        var snap = await fbDb.ref("orders_by_ref").get();
        var raw = snap.exists() ? snap.val() : {};
        Object.keys(raw || {}).forEach(function (key) {
          orders.push(normalizeOrder(raw[key], key));
        });
      } catch (e) {}
    }
    if (!orders.length) {
      try {
        var local = JSON.parse(localStorage.getItem("ssf-orders-demo") || "[]");
        orders = (local || []).map(function (o) {
          return normalizeOrder(o, o.orderRef);
        });
      } catch (e) {}
    }
    orders.sort(function (a, b) {
      return new Date(b.placedAt || 0).getTime() - new Date(a.placedAt || 0).getTime();
    });
    renderOrderList(host, orders, true);
  }

  async function updateOrderStatus(order, nextStatus) {
    if (!order || !order.orderRef) return;
    if (!currentUser || currentUser.role !== "admin") {
      notify("error", "Only admin can update order status.");
      return;
    }
    var payload = Object.assign({}, order, { status: nextStatus });
    var nextHistory = Array.isArray(order.statusHistory) ? order.statusHistory.slice() : [];
    nextHistory.push({ status: nextStatus, at: new Date().toISOString() });
    try {
      if (firebaseReady && fbDb) {
        await fbDb.ref("orders_by_ref/" + order.orderRef + "/status").set(nextStatus);
        await fbDb.ref("orders_by_ref/" + order.orderRef + "/statusHistory").set(nextHistory);
        if (order.account && order.account.uid) {
          await fbDb.ref("orders/" + order.account.uid + "/" + order.orderRef + "/status").set(nextStatus);
          await fbDb.ref("orders/" + order.account.uid + "/" + order.orderRef + "/statusHistory").set(nextHistory);
        }
      }
      try {
        var local = JSON.parse(localStorage.getItem("ssf-orders-demo") || "[]");
        local = local.map(function (x) {
          if (x && x.orderRef === order.orderRef) return Object.assign({}, x, { status: nextStatus, statusHistory: nextHistory });
          return x;
        });
        localStorage.setItem("ssf-orders-demo", JSON.stringify(local));
      } catch (e) {}
      notify("success", "Order " + order.orderRef + " updated to " + prettyStatus(nextStatus) + ".");
      await loadAdminOrders();
      await loadUserOrders();
    } catch (e) {
      notify("error", "Failed to update order status.");
    }
  }

  function resetAdminProductForm() {
    var form = document.getElementById("admin-product-form");
    var submitBtn = document.getElementById("admin-product-submit");
    if (!form) return;
    form.reset();
    var idInput = form.querySelector('[name="product_id"]');
    if (idInput) idInput.value = "";
    if (submitBtn) submitBtn.textContent = "Save product";
  }

  function fillAdminProductForm(product) {
    var form = document.getElementById("admin-product-form");
    var submitBtn = document.getElementById("admin-product-submit");
    if (!form || !product) return;
    form.querySelector('[name="product_id"]').value = product.id || "";
    form.querySelector('[name="title"]').value = product.title || "";
    form.querySelector('[name="description"]').value = product.description || "";
    form.querySelector('[name="price"]').value =
      product.variants && product.variants[0] ? String(product.variants[0].price || "") : "";
    form.querySelector('[name="image"]').value = product.images && product.images[0] ? product.images[0] : "";
    if (submitBtn) submitBtn.textContent = "Update product";
  }

  async function addProductFromAdminForm(ev) {
    ev.preventDefault();
    if (!currentUser || currentUser.role !== "admin") {
      notify("error", "Only admin can add products.");
      return;
    }
    var form = ev.target;
    var data = new FormData(form);
    var title = String(data.get("title") || "").trim();
    var description = String(data.get("description") || "").trim();
    var price = Number(data.get("price") || 0);
    var image = String(data.get("image") || "").trim();
    var productId = String(data.get("product_id") || "").trim();
    if (!title || !description || !image || price <= 0) {
      notify("error", "Please complete all product fields.");
      return;
    }
    var id = productId || slugify(title) || "product-" + Date.now();
    var product = {
      id: id,
      title: title,
      description: description,
      images: [image],
      hidden: false,
      outOfStock: false,
      isDeleted: false,
      variants: [{ id: "std", label: "Standard — " + formatPHP(price), price: price, short: "Standard" }],
    };
    var existing = PRODUCTS.find(function (p) {
      return p.id === id;
    });
    if (existing) {
      product.hidden = !!existing.hidden;
      product.outOfStock = !!existing.outOfStock;
      product.isDeleted = !!existing.isDeleted;
      if (existing.options) product.options = existing.options;
    }
    try {
      if (firebaseReady && fbDb) {
        await fbDb.ref("products/" + id).set(product);
      }
      if (existing) {
        PRODUCTS = PRODUCTS.map(function (p) {
          return p.id === id ? normalizeProductRecord(product) : p;
        });
      } else {
        PRODUCTS.push(normalizeProductRecord(product));
      }
      renderProducts();
      resetAdminProductForm();
      loadAdminProducts();
      notify("success", existing ? "Product updated: " + title : "Product added: " + title);
    } catch (e) {
      notify("error", "Failed to save product.");
    }
  }

  async function syncProductState(productId, patch) {
    var idx = PRODUCTS.findIndex(function (p) {
      return p.id === productId;
    });
    if (idx < 0) return;
    var next = Object.assign({}, PRODUCTS[idx], patch || {});
    try {
      if (firebaseReady && fbDb) {
        await fbDb.ref("products/" + productId).update(patch || {});
      }
      PRODUCTS[idx] = next;
      renderProducts();
      loadAdminProducts();
    } catch (e) {
      notify("error", "Failed updating product.");
    }
  }

  async function removeProduct(productId) {
    var idx = PRODUCTS.findIndex(function (p) {
      return p.id === productId;
    });
    if (idx < 0) return;
    try {
      if (firebaseReady && fbDb) {
        await fbDb.ref("products/" + productId).update({
          isDeleted: true,
          hidden: true,
        });
      }
      PRODUCTS[idx] = Object.assign({}, PRODUCTS[idx], {
        isDeleted: true,
        hidden: true,
      });
      renderProducts();
      loadAdminProducts();
      notify("success", "Product removed. You can restore it anytime.");
    } catch (e) {
      notify("error", "Failed removing product.");
    }
  }

  async function restoreProduct(productId) {
    var idx = PRODUCTS.findIndex(function (p) {
      return p.id === productId;
    });
    if (idx < 0) return;
    try {
      if (firebaseReady && fbDb) {
        await fbDb.ref("products/" + productId).update({
          isDeleted: false,
        });
      }
      PRODUCTS[idx] = Object.assign({}, PRODUCTS[idx], {
        isDeleted: false,
      });
      renderProducts();
      loadAdminProducts();
      notify("success", "Product restored.");
    } catch (e) {
      notify("error", "Failed restoring product.");
    }
  }

  function renderAdminProducts(products) {
    var host = document.getElementById("admin-products-list");
    if (!host) return;
    host.innerHTML = "";
    if (!products.length) {
      var empty = document.createElement("p");
      empty.className = "muted small";
      empty.textContent = "No products found.";
      host.appendChild(empty);
      return;
    }
    products.forEach(function (p) {
      var card = document.createElement("article");
      card.className = "order-card";

      var top = document.createElement("div");
      top.className = "order-card-top";
      var title = document.createElement("strong");
      title.textContent = p.title;
      var status = document.createElement("span");
      var txt = p.outOfStock ? "Out of stock" : "In stock";
      if (p.hidden) txt += " • Hidden";
      if (p.isDeleted) txt += " • Removed";
      status.className = "status-pill " + (p.outOfStock ? "status-pending" : "status-approved");
      status.textContent = txt;
      top.appendChild(title);
      top.appendChild(status);

      var meta = document.createElement("p");
      meta.className = "product-admin-meta muted small";
      meta.textContent = "ID: " + p.id;

      var actions = document.createElement("div");
      actions.className = "order-actions";

      if (p.isDeleted) {
        var restoreBtn = document.createElement("button");
        restoreBtn.type = "button";
        restoreBtn.className = "primary";
        restoreBtn.textContent = "Restore product";
        restoreBtn.addEventListener("click", function () {
          restoreProduct(p.id);
        });
        actions.appendChild(restoreBtn);
      } else {
        var editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "ghost";
        editBtn.textContent = "Edit product";
        editBtn.addEventListener("click", function () {
          fillAdminProductForm(p);
        });
        actions.appendChild(editBtn);

        var hideBtn = document.createElement("button");
        hideBtn.type = "button";
        hideBtn.className = "ghost";
        hideBtn.textContent = p.hidden ? "Show product" : "Hide product";
        hideBtn.addEventListener("click", function () {
          syncProductState(p.id, { hidden: !p.hidden });
        });
        actions.appendChild(hideBtn);

        var stockBtn = document.createElement("button");
        stockBtn.type = "button";
        stockBtn.className = "ghost";
        stockBtn.textContent = p.outOfStock ? "Mark in stock" : "Mark out of stock";
        stockBtn.addEventListener("click", function () {
          syncProductState(p.id, { outOfStock: !p.outOfStock });
        });
        actions.appendChild(stockBtn);

        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "ghost";
        removeBtn.textContent = "Remove product";
        removeBtn.addEventListener("click", function () {
          if (!confirm("Remove this product? You can restore it later from admin dashboard.")) return;
          removeProduct(p.id);
        });
        actions.appendChild(removeBtn);
      }

      card.appendChild(top);
      card.appendChild(meta);
      card.appendChild(actions);
      host.appendChild(card);
    });
  }

  async function loadAdminProducts() {
    if (!currentUser || currentUser.role !== "admin") {
      renderAdminProducts([]);
      return;
    }
    renderAdminProducts(
      PRODUCTS
    );
  }

  function initDashboards() {
    var myOpen = document.getElementById("my-orders-open");
    var myClose = document.getElementById("my-orders-close");
    var adminOpen = document.getElementById("admin-dashboard-open");
    var adminClose = document.getElementById("admin-dashboard-close");
    var mySection = document.getElementById("my-orders-dashboard");
    var adminSection = document.getElementById("admin-dashboard");
    var productForm = document.getElementById("admin-product-form");
    var productResetBtn = document.getElementById("admin-product-reset");

    if (myOpen) {
      myOpen.addEventListener("click", function () {
        setSectionVisible(mySection, true);
        loadUserOrders();
      });
    }
    if (myClose) {
      myClose.addEventListener("click", function () {
        setSectionVisible(mySection, false);
      });
    }
    if (adminOpen) {
      adminOpen.addEventListener("click", function () {
        if (!currentUser || currentUser.role !== "admin") {
          notify("error", "Admin access only.");
          return;
        }
        setSectionVisible(adminSection, true);
        loadAdminOrders();
        loadAdminProducts();
      });
    }
    if (adminClose) {
      adminClose.addEventListener("click", function () {
        setSectionVisible(adminSection, false);
      });
    }
    if (productForm) {
      productForm.addEventListener("submit", addProductFromAdminForm);
    }
    if (productResetBtn) {
      productResetBtn.addEventListener("click", function () {
        resetAdminProductForm();
      });
    }
  }

  function initReceiptUi() {
    var closeBtn = document.getElementById("receipt-close");
    var backdrop = document.getElementById("receipt-backdrop");
    var openOrdersBtn = document.getElementById("receipt-open-orders");
    if (closeBtn) closeBtn.addEventListener("click", closeReceiptDialog);
    if (backdrop) backdrop.addEventListener("click", closeReceiptDialog);
    if (openOrdersBtn) {
      openOrdersBtn.addEventListener("click", function () {
        closeReceiptDialog();
        window.location.href = "user-orders.html";
      });
    }
  }

  var yr = document.getElementById("year");
  if (yr) yr.textContent = String(new Date().getFullYear());

  initAuthUi();
  initDashboards();
  initReceiptUi();
  enforceNumericInput(document);
  loadProductsFromRealtimeDb().then(function () {
    return loadPromosFromRealtimeDb();
  }).then(function () {
    initShowcaseCarousel();
    initDiscountCarousel();
    if (document.getElementById("products") && document.getElementById("product-card-template")) {
      renderProducts();
    }
    renderCart();
  });
})();
