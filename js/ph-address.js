/**
 * Cascading Philippine address picker (regions → provinces / NCR cities → cities → barangays)
 * Data: PSA PSGC mirror https://psgc.gitlab.io/api/ (free, read-only JSON).
 */
(function (global) {
  "use strict";

  global.PH_ADDRESS_API = {
    base: "https://psgc.gitlab.io/api",
    ncrCode: "130000000",
    /** Replace with what your flower shop charges (sample amounts). */
    deliveryPhp: {
      ncr: 99,
      luzonProvincial: 159,
      visayas: 259,
      mindanao: 359,
    },
    farIslandNote:
      "Your area is farther from our usual delivery zone—we’ve added an extra routing fee below. Salamat po for your patience and understanding.",
  };

  global.initPhilippinesAddressPickers = function (formEl, deps) {
    if (!formEl) return function () {};

    var api = PH_ADDRESS_API.base;
    var ncr = PH_ADDRESS_API.ncrCode;
    var tiers = PH_ADDRESS_API.deliveryPhp;
    var farNote = PH_ADDRESS_API.farIslandNote;

    var regionSel = formEl.querySelector("#addr-region");
    var provinceWrap = formEl.querySelector("#province-wrap");
    var provinceSel = formEl.querySelector("#addr-province");
    var citySel = formEl.querySelector("#addr-city");
    var brgySel = formEl.querySelector("#addr-barangay");
    var totalsPanel = deps && deps.totalsPanel;
    var getProductSubtotal = deps && deps.getProductSubtotal;

    var regionsLoaded = [];

    function formatPHP(x) {
      return deps.formatPHP(x);
    }

    function fetchJson(url) {
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error("Bad response");
        return r.json();
      });
    }

    function setOptions(sel, items, placeholder, valueKey, labelFn) {
      while (sel.firstChild) sel.removeChild(sel.firstChild);
      var ph = document.createElement("option");
      ph.value = "";
      ph.textContent = placeholder;
      sel.appendChild(ph);
      items.forEach(function (it) {
        var o = document.createElement("option");
        o.value = it[valueKey];
        o.textContent = labelFn(it);
        sel.appendChild(o);
      });
      sel.disabled = items.length === 0 && placeholder.indexOf("Loading") === -1;
    }

    function resetLowerThanProvince() {
      setOptions(citySel, [], "Select city…", "code", function () {
        return "";
      });
      setOptions(brgySel, [], "Select barangay…", "code", function () {
        return "";
      });
      citySel.disabled = true;
      brgySel.disabled = true;
    }

    function resetLowerThanCity() {
      setOptions(brgySel, [], "Select barangay…", "code", function () {
        return "";
      });
      brgySel.disabled = true;
    }

    function currentDeliveryInfo() {
      var opt = regionSel.options[regionSel.selectedIndex];
      if (!regionSel.value || !opt) {
        return { fee: 0, tierName: "", farNote: "", ready: false };
      }
      var island = opt.getAttribute("data-island") || "";
      var code = regionSel.value;
      if (code === ncr) {
        return { fee: tiers.ncr, tierName: "Metro Manila area", farNote: "", ready: true, island: "luzon" };
      }
      if (island === "luzon") {
        return { fee: tiers.luzonProvincial, tierName: "Luzon (outside Metro Manila)", farNote: "", ready: true, island: island };
      }
      if (island === "visayas") {
        return { fee: tiers.visayas, tierName: "Visayas route", farNote: farNote, ready: true, island: island };
      }
      if (island === "mindanao") {
        return { fee: tiers.mindanao, tierName: "Mindanao route", farNote: farNote, ready: true, island: island };
      }
      return { fee: tiers.mindanao, tierName: "Other areas", farNote: farNote, ready: true, island: island };
    }

    function refreshTotals() {
      if (!totalsPanel || !getProductSubtotal) return;
      var sub = getProductSubtotal();
      var d = currentDeliveryInfo();
      totalsPanel.hidden = !(sub > 0);
      var subEl = totalsPanel.querySelector(".js-sub-products");
      var feeEl = totalsPanel.querySelector(".js-sub-delivery");
      var noteEl = totalsPanel.querySelector(".js-delivery-note");
      var grandEl = totalsPanel.querySelector(".js-grand-total");
      if (subEl) subEl.textContent = formatPHP(sub);
      if (!regionSel.value) {
        if (feeEl) feeEl.textContent = "—";
        if (grandEl) grandEl.textContent = formatPHP(sub);
        if (noteEl) {
          noteEl.textContent = "Pick your region above to estimate delivery.";
          noteEl.hidden = false;
        }
        return;
      }
      var fee = d.ready ? d.fee : 0;
      var grand = sub + fee;
      if (feeEl) feeEl.textContent = d.ready ? formatPHP(fee) + " (" + d.tierName + ")" : "—";
      if (grandEl) grandEl.textContent = formatPHP(grand);
      if (noteEl) {
        if (d.farNote && d.ready) {
          noteEl.innerHTML =
            d.farNote + " Estimated delivery tier: <strong>" + formatPHP(fee) + "</strong>.";
        } else {
          noteEl.textContent =
            "Delivery fee reflects distance from our usual routes; riders may confirm if your barangay needs a small adjustment.";
        }
        noteEl.hidden = false;
      }
    }

    function loadRegions() {
      setOptions(regionSel, [], "Loading regions…", "code", function () {
        return "";
      });
      regionSel.disabled = true;
      fetchJson(api + "/regions")
        .then(function (regions) {
          regionsLoaded = regions.slice().sort(function (a, b) {
            return a.name.localeCompare(b.name);
          });
          while (regionSel.firstChild) regionSel.removeChild(regionSel.firstChild);
          var ph = document.createElement("option");
          ph.value = "";
          ph.textContent = "Select region…";
          regionSel.appendChild(ph);
          regionsLoaded.forEach(function (r) {
            var o = document.createElement("option");
            o.value = r.code;
            var label =
              r.regionName && r.regionName.indexOf(r.name) !== 0 ? r.regionName + " · " + r.name : r.name;
            o.textContent = label;
            o.setAttribute("data-island", r.islandGroupCode || "");
            regionSel.appendChild(o);
          });
          regionSel.disabled = false;
        })
        .catch(function () {
          setOptions(regionSel, [], "Could not load regions (check internet)", "code", function () {
            return "";
          });
          alert("Philippine regions could not load. Check your internet connection or try again later.");
        });
    }

    function onRegionChange() {
      resetLowerThanProvince();
      var rc = regionSel.value;
      if (!rc) {
        if (provinceWrap) provinceWrap.hidden = false;
        provinceSel.setAttribute("required", "required");
        provinceSel.disabled = true;
        setOptions(provinceSel, [], "Select region first…", "code", function () {
          return "";
        });
        refreshTotals();
        return;
      }

      refreshTotals();

      if (rc === ncr) {
        if (provinceWrap) provinceWrap.hidden = true;
        provinceSel.removeAttribute("required");
        provinceSel.disabled = true;
        setOptions(provinceSel, [{ code: "__ncr__", name: "NCR — see city below" }], "", "code", function (x) {
          return x.name;
        });
        provinceSel.value = "__ncr__";
        setOptions(citySel, [], "Loading cities…", "code", function () {
          return "";
        });
        citySel.disabled = true;
        fetchJson(api + "/regions/" + rc + "/cities-municipalities")
          .then(function (cities) {
            cities.sort(function (a, b) {
              return a.name.localeCompare(b.name);
            });
            setOptions(citySel, cities, "Select city (Metro Manila)", "code", function (c) {
              return c.name;
            });
            citySel.disabled = false;
          })
          .catch(function () {
            setOptions(citySel, [], "Failed to load cities", "code", function () {
              return "";
            });
          });
        return;
      }

      if (provinceWrap) provinceWrap.hidden = false;
      provinceSel.setAttribute("required", "required");
      provinceSel.disabled = true;
      setOptions(provinceSel, [], "Loading provinces…", "code", function () {
        return "";
      });
      setOptions(citySel, [], "Select province first…", "code", function () {
        return "";
      });
      fetchJson(api + "/regions/" + rc + "/provinces")
        .then(function (provinces) {
          provinces.sort(function (a, b) {
            return a.name.localeCompare(b.name);
          });
          setOptions(provinceSel, provinces, "Select province…", "code", function (p) {
            return p.name;
          });
          provinceSel.disabled = provinces.length === 0;
        })
        .catch(function () {
          setOptions(provinceSel, [], "Failed to load provinces", "code", function () {
            return "";
          });
        });
    }

    function onProvinceChange() {
      resetLowerThanProvince();
      var pc = provinceSel.value;
      if (!pc || pc === "__ncr__" || provinceSel.disabled) return;
      if (provinceWrap && provinceWrap.hidden) return;
      setOptions(citySel, [], "Loading cities…", "code", function () {
        return "";
      });
      citySel.disabled = true;
      fetchJson(api + "/provinces/" + pc + "/cities-municipalities")
        .then(function (cities) {
          cities.sort(function (a, b) {
            return a.name.localeCompare(b.name);
          });
          setOptions(citySel, cities, "Select city / municipality…", "code", function (c) {
            return c.name;
          });
          citySel.disabled = false;
        })
        .catch(function () {
          setOptions(citySel, [], "Failed to load cities", "code", function () {
            return "";
          });
        });
    }

    function onCityChange() {
      resetLowerThanCity();
      var cc = citySel.value;
      if (!cc || citySel.disabled) return;
      setOptions(brgySel, [], "Loading barangays…", "code", function () {
        return "";
      });
      brgySel.disabled = true;
      fetchJson(api + "/cities-municipalities/" + cc + "/barangays")
        .then(function (brgys) {
          brgys.sort(function (a, b) {
            return a.name.localeCompare(b.name);
          });
          setOptions(brgySel, brgys, "Select barangay…", "code", function (b) {
            return b.name;
          });
          brgySel.disabled = false;
        })
        .catch(function () {
          setOptions(brgySel, [], "Failed to load barangays", "code", function () {
            return "";
          });
        });
    }

    function addressFullySelected() {
      if (!regionSel.value) return false;
      if (!citySel.value || !brgySel.value) return false;
      if (regionSel.value === ncr) return true;
      return !!provinceSel.value;
    }

    function getTotals() {
      var sub = getProductSubtotal();
      var d = currentDeliveryInfo();
      var fee = regionSel.value && d.ready ? d.fee : 0;
      var grand = sub + fee;
      return {
        productSubtotal: sub,
        deliveryFee: fee,
        grandTotal: grand,
        farNote: d.farNote,
        tierLabel: d.tierName,
        addressComplete: addressFullySelected(),
      };
    }

    regionSel.addEventListener("change", onRegionChange);
    provinceSel.addEventListener("change", onProvinceChange);
    citySel.addEventListener("change", onCityChange);

    loadRegions();

    function checkoutAddressReset() {
      regionSel.value = "";
      onRegionChange();
      refreshTotals();
    }

    function waitForOption(sel, value, timeoutMs) {
      return new Promise(function (resolve, reject) {
        var start = Date.now();
        var t = setInterval(function () {
          var found = false;
          for (var i = 0; i < sel.options.length; i++) {
            if (sel.options[i].value === value) {
              found = true;
              break;
            }
          }
          if (found) {
            clearInterval(t);
            resolve(true);
            return;
          }
          if (Date.now() - start > (timeoutMs || 6000)) {
            clearInterval(t);
            reject(new Error("Option not found"));
          }
        }, 120);
      });
    }

    async function setAddress(addr) {
      if (!addr) return;
      if (addr.regionCode) {
        regionSel.value = addr.regionCode;
        onRegionChange();
        await waitForOption(citySel, addr.cityCode || "", 6000).catch(function () {});
      }
      if (addr.provinceCode && addr.regionCode !== ncr) {
        await waitForOption(provinceSel, addr.provinceCode, 6000).catch(function () {});
        provinceSel.value = addr.provinceCode;
        onProvinceChange();
      }
      if (addr.cityCode) {
        await waitForOption(citySel, addr.cityCode, 6000).catch(function () {});
        citySel.value = addr.cityCode;
        onCityChange();
      }
      if (addr.barangayCode) {
        await waitForOption(brgySel, addr.barangayCode, 6000).catch(function () {});
        brgySel.value = addr.barangayCode;
      }
      refreshTotals();
    }

    return { reset: checkoutAddressReset, refresh: refreshTotals, getTotals: getTotals, setAddress: setAddress };
  };
})(typeof window !== "undefined" ? window : globalThis);
