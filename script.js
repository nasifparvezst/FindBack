
const FB_KEY = "findback_final_v3";

function loadData(){
  const saved = localStorage.getItem(FB_KEY);
  if(saved){
    try { return JSON.parse(saved); }
    catch(e){ localStorage.removeItem(FB_KEY); }
  }

  const today = new Date();
  const dateText = today.toISOString().slice(0,10);

  const data = {
    items: [
      {
        id: 1001,
        type: "Lost",
        name: "Black Wallet",
        category: "Wallet",
        location: "University Cafeteria",
        date: dateText,
        description: "Black leather wallet with a small silver logo on the front.",
        contact: "01700000001",
        status: "Lost",
        mine: true,
        createdAt: Date.now() - 400000
      },
      {
        id: 1002,
        type: "Found",
        name: "Black Wallet",
        category: "Wallet",
        location: "Cafeteria",
        date: dateText,
        description: "Black leather wallet found beside a cafeteria table.",
        contact: "01700000002",
        status: "Found",
        mine: false,
        createdAt: Date.now() - 300000
      },
      {
        id: 1003,
        type: "Lost",
        name: "Student ID Card",
        category: "ID Card",
        location: "Central Library",
        date: dateText,
        description: "Blue university ID card inside a transparent plastic holder.",
        contact: "01700000003",
        status: "Lost",
        mine: true,
        createdAt: Date.now() - 200000
      },
      {
        id: 1004,
        type: "Found",
        name: "USB Flash Drive",
        category: "Electronics",
        location: "Computer Lab",
        date: dateText,
        description: "A black 32GB USB flash drive found near the front computers.",
        contact: "01700000004",
        status: "Returned",
        mine: false,
        createdAt: Date.now() - 100000
      }
    ]
  };

  saveData(data);
  return data;
}

function saveData(data){
  localStorage.setItem(FB_KEY, JSON.stringify(data));
}

function escapeHTML(value){
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[ch]));
}

function iconFor(category){
  const icons = {
    "Phone":"📱",
    "Wallet":"👛",
    "ID Card":"🪪",
    "Bag":"🎒",
    "Keys":"🔑",
    "Electronics":"💻",
    "Book":"📚",
    "Other":"📦"
  };
  return icons[category] || "📦";
}

function setActiveNav(){
  const current = document.body.dataset.page;
  document.querySelectorAll(".navlinks a").forEach(link => {
    if(link.dataset.page === current) link.classList.add("active");
  });
}

function normalizePhone(phone){
  return phone.replace(/[ -]/g,"");
}

function isValidBangladeshPhone(phone){
  const p = normalizePhone(phone);
  return /^(?:\+?8801|01)[3-9]\d{8}$/.test(p);
}

function isFutureDate(dateString){
  const inputDate = new Date(dateString + "T00:00:00");
  const today = new Date();
  today.setHours(0,0,0,0);
  return inputDate > today;
}

function validateReport(values){
  const errors = [];

  if(values.name.trim().length < 2){
    errors.push("Item name must contain at least 2 characters.");
  }

  if(values.location.trim().length < 2){
    errors.push("Location must contain at least 2 characters.");
  }

  if(!values.date){
    errors.push("Please select a date.");
  } else if(isFutureDate(values.date)){
    errors.push("The lost/found date cannot be in the future.");
  }

  if(values.description.trim().length < 10){
    errors.push("Description must contain at least 10 characters.");
  }

  if(!isValidBangladeshPhone(values.contact)){
    errors.push("Enter a valid Bangladesh mobile number, for example 01712345678.");
  }

  return errors;
}

function showFormMessage(message, type="error"){
  const box = document.getElementById("formMessage");
  if(!box) return;
  box.className = type === "success" ? "success-box" : "error-text";
  box.innerHTML = message;
  box.style.display = "block";
}

function clearFormMessage(){
  const box = document.getElementById("formMessage");
  if(box){
    box.innerHTML = "";
    box.style.display = "none";
  }
}

function getStats(){
  const items = loadData().items;
  return {
    activeLost: items.filter(x => x.status === "Lost" || x.status === "Matched").length,
    activeFound: items.filter(x => x.status === "Found" || x.status === "Claimed").length,
    returned: items.filter(x => x.status === "Returned").length,
    total: items.length
  };
}

function itemCard(item){
  const matchedText = item.matchedWith
    ? `<div class="match-note">🔗 Connected with report #${escapeHTML(item.matchedWith)}</div>`
    : "";

  return `
    <article class="card item-card">
      <div class="item-icon">${iconFor(item.category)}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
          <h3>${escapeHTML(item.name)}</h3>
          <span class="badge status-${item.status.toLowerCase()}">${escapeHTML(item.status)}</span>
        </div>
        <div class="meta">
          ${escapeHTML(item.category)} • ${escapeHTML(item.location)}<br>
          ${escapeHTML(item.date)} • ${escapeHTML(item.type)} report
        </div>
        ${matchedText}
        <a class="btn btn-outline btn-small" href="details.html?id=${item.id}">View Details</a>
      </div>
    </article>
  `;
}

function renderHome(){
  const stats = getStats();
  document.getElementById("lostCount").textContent = stats.activeLost;
  document.getElementById("foundCount").textContent = stats.activeFound;
  document.getElementById("returnedCount").textContent = stats.returned;
  document.getElementById("totalCount").textContent = stats.total;

  const recent = [...loadData().items]
    .sort((a,b) => (b.createdAt || b.id) - (a.createdAt || a.id))
    .slice(0,6);

  const grid = document.getElementById("recentItems");
  grid.innerHTML = recent.length
    ? recent.map(itemCard).join("")
    : `<div class="empty"><strong>No reports yet.</strong>Submit a Lost or Found report to get started.</div>`;
}

function initReportForm(type){
  const form = document.getElementById("reportForm");
  const dateInput = form.querySelector('input[name="date"]');
  dateInput.max = new Date().toISOString().slice(0,10);

  form.addEventListener("submit", e => {
    e.preventDefault();
    clearFormMessage();

    const fd = new FormData(form);
    const values = {
      name: fd.get("name"),
      category: fd.get("category"),
      location: fd.get("location"),
      date: fd.get("date"),
      description: fd.get("description"),
      contact: fd.get("contact")
    };

    const errors = validateReport(values);
    if(errors.length){
      showFormMessage(errors.map(e => `• ${escapeHTML(e)}`).join("<br>"));
      return;
    }

    const data = loadData();
    const newItem = {
      id: Date.now(),
      type,
      name: values.name.trim(),
      category: values.category,
      location: values.location.trim(),
      date: values.date,
      description: values.description.trim(),
      contact: normalizePhone(values.contact),
      status: type === "Lost" ? "Lost" : "Found",
      mine: true,
      createdAt: Date.now()
    };

    data.items.push(newItem);
    saveData(data);
    form.reset();

    const matchLink = `<a href="matches.html"><strong>Check Possible Matches</strong></a>`;
    showFormMessage(
      `${escapeHTML(type)} item report submitted successfully. ${matchLink}`,
      "success"
    );
  });
}

function renderBrowse(){
  const query = (document.getElementById("search").value || "").trim().toLowerCase();
  const category = document.getElementById("category").value;
  const status = document.getElementById("status").value;
  const type = document.getElementById("typeFilter").value;

  const items = [...loadData().items]
    .filter(item => {
      const haystack = `${item.name} ${item.location} ${item.description} ${item.category}`.toLowerCase();
      return (
        haystack.includes(query) &&
        (category === "All" || item.category === category) &&
        (status === "All" || item.status === status) &&
        (type === "All" || item.type === type)
      );
    })
    .sort((a,b) => (b.createdAt || b.id) - (a.createdAt || a.id));

  const grid = document.getElementById("itemGrid");
  grid.innerHTML = items.length
    ? items.map(itemCard).join("")
    : `<div class="empty"><strong>No matching items found.</strong>Try changing your search text or filters.</div>`;
}

function renderMyReports(){
  const myItems = [...loadData().items]
    .filter(item => item.mine)
    .sort((a,b) => (b.createdAt || b.id) - (a.createdAt || a.id));

  const grid = document.getElementById("mineGrid");

  if(!myItems.length){
    grid.innerHTML = `
      <div class="empty">
        <strong>No reports submitted from this browser.</strong>
        Use Report Lost or Report Found to create your first report.
      </div>`;
    return;
  }

  grid.innerHTML = myItems.map(item => {
    const matchInfo = item.matchedWith
      ? `<div class="match-note">🔗 Matched with report #${escapeHTML(item.matchedWith)}</div>`
      : `<div class="match-note subtle">No report has been matched yet.</div>`;

    let statusAction = "";
    if(item.matchedWith && item.status !== "Returned"){
      statusAction = `<button class="btn btn-success btn-small" onclick="markPairReturned(${item.id})">Mark Both Returned</button>`;
    } else if(!item.matchedWith && item.status !== "Returned"){
      statusAction = `<a class="btn btn-success btn-small" href="matches.html">Find Match</a>`;
    }

    return `
      <article class="card item-card">
        <div class="item-icon">${iconFor(item.category)}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
            <h3>${escapeHTML(item.name)}</h3>
            <span class="badge status-${item.status.toLowerCase()}">${escapeHTML(item.status)}</span>
          </div>

          <div class="meta">
            ${escapeHTML(item.category)} • ${escapeHTML(item.location)} • ${escapeHTML(item.date)}
          </div>

          ${matchInfo}

          <div class="action-row">
            <a class="btn btn-outline btn-small" href="details.html?id=${item.id}">Details</a>
            <a class="btn btn-warning btn-small" href="edit-report.html?id=${item.id}">Edit</a>
            ${statusAction}
            <button class="btn btn-danger btn-small" onclick="deleteReport(${item.id})">Delete</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function deleteReport(id){
  const data = loadData();
  const item = data.items.find(x => x.id === id);

  if(!item) return;

  if(item.matchedWith){
    alert("This report is connected to another report. Undo the match from Possible Matches before deleting it.");
    return;
  }

  const confirmed = confirm(`Delete the report for "${item.name}"? This action cannot be undone.`);
  if(!confirmed) return;

  data.items = data.items.filter(x => x.id !== id);
  saveData(data);
  renderMyReports();
}

function renderDetails(){
  const id = Number(new URLSearchParams(location.search).get("id"));
  const item = loadData().items.find(x => x.id === id);
  const target = document.getElementById("detail");

  if(!item){
    target.innerHTML = `
      <div class="empty">
        <strong>Report not found.</strong>
        The report may have been deleted or the link may be invalid.
        <div style="margin-top:14px"><a class="btn btn-primary" href="browse.html">Back to Browse</a></div>
      </div>`;
    return;
  }

  const matchInfo = item.matchedWith
    ? `<div class="detail-box"><span class="label">Connected Report</span><a href="details.html?id=${item.matchedWith}">Report #${escapeHTML(item.matchedWith)}</a></div>`
    : `<div class="detail-box"><span class="label">Connected Report</span>Not matched yet</div>`;

  let matchAction = "";
  if(item.matchedWith && item.status !== "Returned"){
    matchAction = `<button class="btn btn-success" onclick="markPairReturned(${item.id}, true)">Mark Both Returned</button>`;
  } else if(!item.matchedWith && item.status !== "Returned"){
    matchAction = `<a class="btn btn-success" href="matches.html">Find Possible Match</a>`;
  }

  const ownerActions = item.mine
    ? `
      <a class="btn btn-warning" href="edit-report.html?id=${item.id}">Edit Report</a>
      <a class="btn btn-outline" href="my-reports.html">My Reports</a>
    `
    : "";

  target.innerHTML = `
    <div class="big-icon">${iconFor(item.category)}</div>

    <section class="card">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <span class="badge type-${item.type.toLowerCase()}">${escapeHTML(item.type)} report</span>
        <span class="badge status-${item.status.toLowerCase()}">${escapeHTML(item.status)}</span>
      </div>

      <h1>${escapeHTML(item.name)}</h1>
      <p class="muted">${escapeHTML(item.description)}</p>

      <div class="detail-list">
        <div class="detail-box"><span class="label">Category</span>${escapeHTML(item.category)}</div>
        <div class="detail-box"><span class="label">Date</span>${escapeHTML(item.date)}</div>
        <div class="detail-box"><span class="label">Location</span>${escapeHTML(item.location)}</div>
        <div class="detail-box"><span class="label">Contact</span>${escapeHTML(item.contact)}</div>
        ${matchInfo}
      </div>

      <div class="action-row">
        <a class="btn btn-primary" href="browse.html">Back to Browse</a>
        ${matchAction}
        ${ownerActions}
      </div>
    </section>
  `;
}

function initEditReport(){
  const id = Number(new URLSearchParams(location.search).get("id"));
  const data = loadData();
  const item = data.items.find(x => x.id === id);
  const form = document.getElementById("editForm");
  const notFound = document.getElementById("notFound");

  if(!item || !item.mine){
    form.style.display = "none";
    notFound.style.display = "block";
    return;
  }

  form.elements["name"].value = item.name;
  form.elements["category"].value = item.category;
  form.elements["location"].value = item.location;
  form.elements["date"].value = item.date;
  form.elements["description"].value = item.description;
  form.elements["contact"].value = item.contact;
  form.querySelector('input[name="date"]').max = new Date().toISOString().slice(0,10);

  if(item.matchedWith){
    showFormMessage("This report is currently matched. You can edit its information, but changing details may affect how the match appears.", "success");
  }

  form.addEventListener("submit", e => {
    e.preventDefault();
    clearFormMessage();

    const fd = new FormData(form);
    const values = {
      name: fd.get("name"),
      category: fd.get("category"),
      location: fd.get("location"),
      date: fd.get("date"),
      description: fd.get("description"),
      contact: fd.get("contact")
    };

    const errors = validateReport(values);
    if(errors.length){
      showFormMessage(errors.map(e => `• ${escapeHTML(e)}`).join("<br>"));
      return;
    }

    item.name = values.name.trim();
    item.category = values.category;
    item.location = values.location.trim();
    item.date = values.date;
    item.description = values.description.trim();
    item.contact = normalizePhone(values.contact);

    saveData(data);
    showFormMessage(
      `Report updated successfully. <a href="details.html?id=${item.id}"><strong>View updated report</strong></a>`,
      "success"
    );
  });
}

/* --------------------------
   MATCHING SYSTEM
-------------------------- */

function normalizeWords(text){
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 1);
}

function wordOverlap(a, b){
  const A = new Set(normalizeWords(a));
  const B = new Set(normalizeWords(b));
  let count = 0;
  A.forEach(word => { if(B.has(word)) count++; });
  return count;
}

function dayDifference(a, b){
  const d1 = new Date(a + "T00:00:00");
  const d2 = new Date(b + "T00:00:00");
  return Math.abs(Math.round((d1 - d2) / 86400000));
}

function calculateMatchScore(lost, found){
  let score = 0;
  const reasons = [];

  if(lost.category === found.category){
    score += 4;
    reasons.push("Same category");
  }

  const nameOverlap = wordOverlap(lost.name, found.name);
  if(lost.name.trim().toLowerCase() === found.name.trim().toLowerCase()){
    score += 4;
    reasons.push("Same item name");
  } else if(nameOverlap > 0){
    score += 2;
    reasons.push("Similar item name");
  }

  if(wordOverlap(lost.location, found.location) > 0){
    score += 2;
    reasons.push("Similar location");
  }

  const diff = dayDifference(lost.date, found.date);
  if(diff <= 1){
    score += 2;
    reasons.push("Very close date");
  } else if(diff <= 7){
    score += 1;
    reasons.push("Close date");
  }

  return { score, reasons };
}

function getPossibleMatches(){
  const items = loadData().items;
  const lostItems = items.filter(x =>
    x.type === "Lost" &&
    x.status === "Lost" &&
    !x.matchedWith
  );
  const foundItems = items.filter(x =>
    x.type === "Found" &&
    x.status === "Found" &&
    !x.matchedWith
  );

  const candidates = [];

  lostItems.forEach(lost => {
    foundItems.forEach(found => {
      const result = calculateMatchScore(lost, found);

      // Require a reasonable similarity. Same category alone is enough to show as a possible match.
      if(result.score >= 4){
        candidates.push({
          lost,
          found,
          score: result.score,
          reasons: result.reasons
        });
      }
    });
  });

  return candidates.sort((a,b) => b.score - a.score);
}

function scoreLabel(score){
  if(score >= 10) return "Very Strong Match";
  if(score >= 7) return "Strong Match";
  return "Possible Match";
}

function renderMatches(){
  const possibleBox = document.getElementById("possibleMatches");
  const activeBox = document.getElementById("activeMatches");

  const candidates = getPossibleMatches();

  possibleBox.innerHTML = candidates.length
    ? candidates.map(pair => `
      <article class="card match-card">
        <div class="match-confidence">
          <span class="badge status-matched">${scoreLabel(pair.score)}</span>
          <span class="small muted">Score: ${pair.score}</span>
        </div>

        <div class="match-columns">
          <div class="match-side">
            <div class="match-heading">LOST REPORT #${pair.lost.id}</div>
            <div class="match-item-title">${iconFor(pair.lost.category)} ${escapeHTML(pair.lost.name)}</div>
            <p class="meta">${escapeHTML(pair.lost.category)} • ${escapeHTML(pair.lost.location)} • ${escapeHTML(pair.lost.date)}</p>
            <p class="small">${escapeHTML(pair.lost.description)}</p>
          </div>

          <div class="match-arrow">⇄</div>

          <div class="match-side">
            <div class="match-heading">FOUND REPORT #${pair.found.id}</div>
            <div class="match-item-title">${iconFor(pair.found.category)} ${escapeHTML(pair.found.name)}</div>
            <p class="meta">${escapeHTML(pair.found.category)} • ${escapeHTML(pair.found.location)} • ${escapeHTML(pair.found.date)}</p>
            <p class="small">${escapeHTML(pair.found.description)}</p>
          </div>
        </div>

        <div class="match-reasons">
          <strong>Why suggested:</strong> ${pair.reasons.map(escapeHTML).join(" • ")}
        </div>

        <div class="action-row">
          <a class="btn btn-outline btn-small" href="details.html?id=${pair.lost.id}">Lost Details</a>
          <a class="btn btn-outline btn-small" href="details.html?id=${pair.found.id}">Found Details</a>
          <button class="btn btn-success" onclick="matchReports(${pair.lost.id}, ${pair.found.id})">Match These Reports</button>
        </div>
      </article>
    `).join("")
    : `<div class="empty"><strong>No possible unmatched pairs right now.</strong>Add a Lost and Found report with similar category/details to test the matching system.</div>`;

  const data = loadData();
  const pairedLostReports = data.items
    .filter(x => x.type === "Lost" && x.matchedWith)
    .sort((a,b) => (b.matchedAt || 0) - (a.matchedAt || 0));

  activeBox.innerHTML = pairedLostReports.length
    ? pairedLostReports.map(lost => {
        const found = data.items.find(x => x.id === lost.matchedWith);
        if(!found) return "";

        const returned = lost.status === "Returned" && found.status === "Returned";

        return `
          <article class="card match-card ${returned ? "returned-pair" : ""}">
            <div class="match-confidence">
              <span class="badge ${returned ? "status-returned" : "status-matched"}">
                ${returned ? "Returned Successfully" : "Active Match"}
              </span>
            </div>

            <div class="match-columns">
              <div class="match-side">
                <div class="match-heading">LOST REPORT #${lost.id}</div>
                <div class="match-item-title">${iconFor(lost.category)} ${escapeHTML(lost.name)}</div>
                <p class="meta">Status: ${escapeHTML(lost.status)}</p>
              </div>

              <div class="match-arrow">🔗</div>

              <div class="match-side">
                <div class="match-heading">FOUND REPORT #${found.id}</div>
                <div class="match-item-title">${iconFor(found.category)} ${escapeHTML(found.name)}</div>
                <p class="meta">Status: ${escapeHTML(found.status)}</p>
              </div>
            </div>

            <div class="action-row">
              <a class="btn btn-outline btn-small" href="details.html?id=${lost.id}">Lost Details</a>
              <a class="btn btn-outline btn-small" href="details.html?id=${found.id}">Found Details</a>
              ${
                returned
                ? ""
                : `<button class="btn btn-success" onclick="markPairReturned(${lost.id})">Mark Both Returned</button>
                   <button class="btn btn-danger btn-small" onclick="undoMatch(${lost.id})">Undo Match</button>`
              }
            </div>
          </article>
        `;
      }).join("")
    : `<div class="empty"><strong>No reports have been connected yet.</strong>Select a suggested pair above and click “Match These Reports”.</div>`;
}

function matchReports(lostId, foundId){
  const data = loadData();
  const lost = data.items.find(x => x.id === lostId);
  const found = data.items.find(x => x.id === foundId);

  if(!lost || !found){
    alert("One of the reports could not be found.");
    return;
  }

  if(lost.type !== "Lost" || found.type !== "Found"){
    alert("A match must connect one Lost report with one Found report.");
    return;
  }

  if(lost.matchedWith || found.matchedWith){
    alert("One of these reports is already connected to another report.");
    renderMatches();
    return;
  }

  if(lost.status !== "Lost" || found.status !== "Found"){
    alert("Only active Lost and Found reports can be matched.");
    renderMatches();
    return;
  }

  const confirmed = confirm(
    `Connect Lost Report #${lost.id} (${lost.name}) with Found Report #${found.id} (${found.name})?`
  );
  if(!confirmed) return;

  lost.status = "Matched";
  found.status = "Claimed";
  lost.matchedWith = found.id;
  found.matchedWith = lost.id;
  lost.matchedAt = Date.now();
  found.matchedAt = lost.matchedAt;

  saveData(data);
  renderMatches();
}

function markPairReturned(reportId, redirectAfter=false){
  const data = loadData();
  const first = data.items.find(x => x.id === reportId);

  if(!first || !first.matchedWith){
    alert("This report is not connected to another report.");
    return;
  }

  const second = data.items.find(x => x.id === first.matchedWith);
  if(!second){
    alert("The connected report could not be found.");
    return;
  }

  const confirmed = confirm(
    `Confirm that "${first.name}" has been returned to its owner? Both connected reports will become Returned.`
  );
  if(!confirmed) return;

  first.status = "Returned";
  second.status = "Returned";
  first.returnedAt = Date.now();
  second.returnedAt = first.returnedAt;

  saveData(data);

  if(redirectAfter){
    location.reload();
    return;
  }

  if(document.body.dataset.page === "matches"){
    renderMatches();
  } else if(document.body.dataset.page === "mine"){
    renderMyReports();
  }
}

function undoMatch(reportId){
  const data = loadData();
  const first = data.items.find(x => x.id === reportId);

  if(!first || !first.matchedWith){
    alert("This report is not currently matched.");
    return;
  }

  const second = data.items.find(x => x.id === first.matchedWith);

  if(!second){
    alert("The connected report could not be found.");
    return;
  }

  if(first.status === "Returned" || second.status === "Returned"){
    alert("A returned pair cannot be unmatched.");
    return;
  }

  const lost = first.type === "Lost" ? first : second;
  const found = first.type === "Found" ? first : second;

  const confirmed = confirm("Undo this match and make both reports active again?");
  if(!confirmed) return;

  lost.status = "Lost";
  found.status = "Found";

  delete lost.matchedWith;
  delete found.matchedWith;
  delete lost.matchedAt;
  delete found.matchedAt;

  saveData(data);
  renderMatches();
}

document.addEventListener("DOMContentLoaded", () => {
  setActiveNav();

  const page = document.body.dataset.page;

  if(page === "home") renderHome();
  if(page === "lost") initReportForm("Lost");
  if(page === "found") initReportForm("Found");

  if(page === "browse"){
    ["search","category","status","typeFilter"].forEach(id => {
      const element = document.getElementById(id);
      element.addEventListener(id === "search" ? "input" : "change", renderBrowse);
    });
    renderBrowse();
  }

  if(page === "matches") renderMatches();
  if(page === "mine") renderMyReports();
  if(page === "details") renderDetails();
  if(page === "edit") initEditReport();
});
