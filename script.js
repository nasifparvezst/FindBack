
const FB_KEY = "findback_final_v4";
const SESSION_KEY = "findback_session_v4";
const ALLOWED_DOMAIN = "@seu.edu.bd";
const ADMIN_EMAIL = "admin@seu.edu.bd";
const ADMIN_PASSWORD = "Admin@123";
const PUBLIC_PAGES = ["login", "register"];
const NOTIFY_MIN_SCORE = 6;

/* --------------------------
   AUTH HELPERS
   (Academic demo only: real security needs a backend)
-------------------------- */

function hashPassword(password){
  const str = "findback::" + password;
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for(let i = 0; i < str.length; i++){
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function getCurrentUser(){
  const id = Number(localStorage.getItem(SESSION_KEY));
  if(!id) return null;
  return loadData().users.find(u => u.id === id) || null;
}

function isAdmin(user = getCurrentUser()){
  return !!user && user.role === "admin";
}

function canManage(item, user = getCurrentUser()){
  return !!user && !!item && (isAdmin(user) || item.ownerId === user.id);
}

function canManagePair(a, b, user = getCurrentUser()){
  return canManage(a, user) || canManage(b, user);
}

function canReturnPair(a, b, user = getCurrentUser()){
  if(!user) return false;
  const lost = a.type === "Lost" ? a : b;
  return isAdmin(user) || lost.ownerId === user.id;
}

function partnerOf(item){
  return item.matchedWith ? loadData().items.find(x => x.id === item.matchedWith) : null;
}

function returnActionsFor(item, small){
  const cls = small ? "btn btn-success btn-small" : "btn btn-success";
  const redirect = small ? "" : ", true";
  if(!canManage(item) || item.status === "Returned") return "";

  if(item.matchedWith){
    const partner = partnerOf(item);
    if(partner && canReturnPair(item, partner)){
      return `<button class="${cls}" onclick="markPairReturned(${item.id}${redirect})">Mark Both Returned</button>`;
    }
    return `<span class="small muted">Waiting for the Lost report owner to confirm return.</span>`;
  }

  const label = item.type === "Lost" ? "I Got My Item Back" : "I Handed It Over";
  return `<a class="${cls}" href="matches.html">Find Match</a>
    <button class="${cls}" onclick="markDirectReturned(${item.id}${redirect})">${label}</button>`;
}

function logout(){
  localStorage.removeItem(SESSION_KEY);
  location.href = "login.html";
}

function guardPage(page){
  const user = getCurrentUser();
  if(!PUBLIC_PAGES.includes(page) && !user){ location.replace("login.html"); return false; }
  if(PUBLIC_PAGES.includes(page) && user){ location.replace("index.html"); return false; }
  if(page === "admin" && !isAdmin(user)){ location.replace("index.html"); return false; }
  return true;
}

function isValidSeuEmail(email){
  return /^[a-z0-9._%+-]+@seu\.edu\.bd$/.test(email);
}

/* --------------------------
   NOTIFICATIONS
-------------------------- */

function notify(data, userId, text, link){
  if(!userId || !data.users.some(u => u.id === userId)) return;
  data.notifications.push({
    id: Date.now() * 1000 + Math.floor(Math.random() * 1000),
    userId,
    text,
    link: link || "notifications.html",
    read: false,
    createdAt: Date.now()
  });
}

function unreadCount(user){
  if(!user) return 0;
  return loadData().notifications.filter(n => n.userId === user.id && !n.read).length;
}

function notifyPair(data, actor, a, b, text){
  [a, b].forEach(it => {
    if(it && it.ownerId && it.ownerId !== actor.id){
      notify(data, it.ownerId, text, "details.html?id=" + it.id);
    }
  });
}

function notifyPossibleMatches(data, newItem){
  const opposite = newItem.type === "Lost" ? "Found" : "Lost";
  let count = 0;

  data.items.forEach(other => {
    if(other.type !== opposite || other.matchedWith || other.status !== opposite) return;

    const lost = newItem.type === "Lost" ? newItem : other;
    const found = newItem.type === "Found" ? newItem : other;
    const result = calculateMatchScore(lost, found);

    if(result.score >= NOTIFY_MIN_SCORE){
      count++;
      if(other.ownerId && other.ownerId !== newItem.ownerId){
        notify(
          data,
          other.ownerId,
          `A new ${newItem.type.toLowerCase()} report "${newItem.name}" may match your ${other.type.toLowerCase()} report "${other.name}".`,
          "details.html?id=" + newItem.id
        );
      }
    }
  });

  return count;
}

/* --------------------------
   IMAGE HELPERS
-------------------------- */

function validImage(item){
  return typeof item.image === "string" && item.image.startsWith("data:image/");
}

function itemThumb(item){
  return validImage(item)
    ? `<div class="item-icon has-photo"><img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.name)}"></div>`
    : `<div class="item-icon">${iconFor(item.category)}</div>`;
}

function detailVisual(item){
  return validImage(item)
    ? `<div class="big-icon has-photo"><img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.name)}"></div>`
    : `<div class="big-icon">${iconFor(item.category)}</div>`;
}

function compressImage(file, maxSize = 800, quality = 0.7){
  return new Promise((resolve, reject) => {
    if(!file.type.startsWith("image/")) return reject(new Error("Please choose an image file (JPG or PNG)."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("The selected file is not a valid image."));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function readImageField(form){
  const input = form.elements["image"];
  const file = input && input.files[0];
  if(!file) return null;
  if(file.size > 8 * 1024 * 1024) throw new Error("Image is too large. Maximum size is 8MB.");
  return compressImage(file);
}

function loadData(){
  const saved = localStorage.getItem(FB_KEY);
  if(saved){
    try {
      const parsed = JSON.parse(saved);
      parsed.items = parsed.items || [];
      parsed.users = parsed.users || [];
      parsed.notifications = parsed.notifications || [];
      return parsed;
    }
    catch(e){ localStorage.removeItem(FB_KEY); }
  }

  const today = new Date();
  const dateText = today.toISOString().slice(0,10);

  const data = {
    users: [
      {
        id: 1,
        name: "System Admin",
        email: ADMIN_EMAIL,
        phone: "01700000000",
        passwordHash: hashPassword(ADMIN_PASSWORD),
        role: "admin",
        createdAt: Date.now()
      }
    ],
    notifications: [],
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
        ownerId: 0,
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
        ownerId: 0,
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
        ownerId: 0,
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
        ownerId: 0,
        createdAt: Date.now() - 100000
      }
    ]
  };

  saveData(data);
  return data;
}

function saveData(data){
  try {
    localStorage.setItem(FB_KEY, JSON.stringify(data));
    return true;
  } catch(e){
    alert("Browser storage is full. Use a smaller photo or delete old reports.");
    return false;
  }
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
      ${itemThumb(item)}
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
  const user = getCurrentUser();
  const dateInput = form.querySelector('input[name="date"]');
  dateInput.max = new Date().toISOString().slice(0,10);
  form.elements["contact"].value = user.phone || "";

  form.addEventListener("submit", async e => {
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

    let image = null;
    try { image = await readImageField(form); }
    catch(err){ showFormMessage(escapeHTML(err.message)); return; }

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
      ownerId: user.id,
      ownerName: user.name,
      createdAt: Date.now()
    };
    if(image) newItem.image = image;

    data.items.push(newItem);
    const matchCount = notifyPossibleMatches(data, newItem);
    if(!saveData(data)) return;

    form.reset();
    form.elements["contact"].value = user.phone || "";

    const matchLink = `<a href="matches.html"><strong>Check Possible Matches</strong></a>`;
    const matchText = matchCount > 0
      ? ` ${matchCount} possible match${matchCount > 1 ? "es" : ""} found and the related owner${matchCount > 1 ? "s were" : " was"} notified.`
      : "";
    showFormMessage(
      `${escapeHTML(type)} item report submitted successfully.${matchText} ${matchLink}`,
      "success"
    );
  });
}

function renderBrowse(){
  const val = id => document.getElementById(id).value;
  const tokens = val("search").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const category = val("category");
  const status = val("status");
  const type = val("typeFilter");
  const from = val("dateFrom");
  const to = val("dateTo");
  const sort = val("sortBy");

  const items = [...loadData().items]
    .filter(item => {
      const haystack = `${item.name} ${item.location} ${item.description} ${item.category}`.toLowerCase();
      return (
        tokens.every(t => haystack.includes(t)) &&
        (category === "All" || item.category === category) &&
        (status === "All" || item.status === status) &&
        (type === "All" || item.type === type) &&
        (!from || item.date >= from) &&
        (!to || item.date <= to)
      );
    })
    .sort((a,b) => {
      if(sort === "oldest") return (a.createdAt || a.id) - (b.createdAt || b.id);
      if(sort === "dateDesc") return b.date.localeCompare(a.date);
      if(sort === "dateAsc") return a.date.localeCompare(b.date);
      if(sort === "name") return a.name.localeCompare(b.name);
      return (b.createdAt || b.id) - (a.createdAt || a.id);
    });

  document.getElementById("resultCount").textContent =
    `${items.length} report${items.length === 1 ? "" : "s"} found`;

  const grid = document.getElementById("itemGrid");
  grid.innerHTML = items.length
    ? items.map(itemCard).join("")
    : `<div class="empty"><strong>No matching items found.</strong>Try changing your search text, dates or filters.</div>`;
}

function initBrowse(){
  const ids = ["search","category","status","typeFilter","dateFrom","dateTo","sortBy"];
  ids.forEach(id => {
    document.getElementById(id).addEventListener(id === "search" ? "input" : "change", renderBrowse);
  });
  document.getElementById("clearFilters").addEventListener("click", () => {
    ids.forEach(id => {
      const el = document.getElementById(id);
      el.value = el.tagName === "SELECT" ? el.options[0].value : "";
    });
    renderBrowse();
  });
  renderBrowse();
}

function renderMyReports(){
  const myItems = [...loadData().items]
    .filter(item => item.ownerId === getCurrentUser().id)
    .sort((a,b) => (b.createdAt || b.id) - (a.createdAt || a.id));

  const grid = document.getElementById("mineGrid");

  if(!myItems.length){
    grid.innerHTML = `
      <div class="empty">
        <strong>You have not submitted any reports yet.</strong>
        Use Report Lost or Report Found to create your first report.
      </div>`;
    return;
  }

  grid.innerHTML = myItems.map(item => {
    const matchInfo = item.matchedWith
      ? `<div class="match-note">🔗 Matched with report #${escapeHTML(item.matchedWith)}</div>`
      : `<div class="match-note subtle">No report has been matched yet.</div>`;

    const statusAction = returnActionsFor(item, true);

    return `
      <article class="card item-card">
        ${itemThumb(item)}
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

  if(!canManage(item)){
    alert("You can only delete your own reports.");
    return;
  }

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

  const matchAction = returnActionsFor(item, false);

  const ownerActions = canManage(item)
    ? `
      <a class="btn btn-warning" href="edit-report.html?id=${item.id}">Edit Report</a>
      <a class="btn btn-outline" href="my-reports.html">My Reports</a>
    `
    : "";

  target.innerHTML = `
    ${detailVisual(item)}

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
        <div class="detail-box"><span class="label">Reported By</span>${escapeHTML(item.ownerName || "Demo data")}</div>
        ${matchInfo}
        ${item.returnedDirect ? `<div class="detail-box"><span class="label">Return Info</span>Returned directly without a matched report${item.returnNote ? ": " + escapeHTML(item.returnNote) : ""}</div>` : ""}
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

  if(!item || !canManage(item)){
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

  if(validImage(item)){
    document.getElementById("currentImage").innerHTML =
      `<img class="edit-thumb" src="${escapeHTML(item.image)}" alt="Current photo">`;
  } else {
    document.getElementById("removeImageRow").style.display = "none";
  }

  if(item.matchedWith){
    showFormMessage("This report is currently matched. You can edit its information, but changing details may affect how the match appears.", "success");
  }

  form.addEventListener("submit", async e => {
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

    let newImage = null;
    try { newImage = await readImageField(form); }
    catch(err){ showFormMessage(escapeHTML(err.message)); return; }

    item.name = values.name.trim();
    item.category = values.category;
    item.location = values.location.trim();
    item.date = values.date;
    item.description = values.description.trim();
    item.contact = normalizePhone(values.contact);

    if(newImage) item.image = newImage;
    else if(form.elements["removeImage"].checked) delete item.image;

    if(!saveData(data)) return;
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
  const user = getCurrentUser();
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
      if(result.score >= 4 && (isAdmin(user) || canManagePair(lost, found, user))){
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
        if(!found || !canManagePair(lost, found)) return "";

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
                : `${canReturnPair(lost, found) ? `<button class="btn btn-success" onclick="markPairReturned(${lost.id})">Mark Both Returned</button>` : `<span class="small muted">Only the Lost report owner can confirm return.</span>`}
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
  const user = getCurrentUser();
  const lost = data.items.find(x => x.id === lostId);
  const found = data.items.find(x => x.id === foundId);

  if(!lost || !found){
    alert("One of the reports could not be found.");
    return;
  }

  if(!canManagePair(lost, found, user)){
    alert("You can only match pairs that include your own report.");
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

  notifyPair(data, user, lost, found, `Your report "${lost.name}" has been connected with a matching ${lost.type === "Lost" ? "found" : "lost"} report.`);

  if(saveData(data)) renderMatches();
}

function markPairReturned(reportId, redirectAfter=false){
  const data = loadData();
  const user = getCurrentUser();
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

  if(!canReturnPair(first, second, user)){
    alert("Only the owner of the Lost report (or an admin) can confirm that the item was returned.");
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

  notifyPair(data, user, first, second, `Your report "${first.name}" was marked as Returned.`);
  if(!saveData(data)) return;

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

function markDirectReturned(reportId, redirectAfter=false){
  const data = loadData();
  const user = getCurrentUser();
  const item = data.items.find(x => x.id === reportId);

  if(!item) return;

  if(!canManage(item, user)){
    alert("You can only update your own reports.");
    return;
  }

  if(item.matchedWith){
    alert("This report is matched with another report. Use Mark Both Returned instead.");
    return;
  }

  if(item.status === "Returned") return;

  const question = item.type === "Lost"
    ? `Confirm that you got "${item.name}" back? Add an optional note (e.g. how it was returned):`
    : `Confirm that you handed "${item.name}" over to its owner? Add an optional note:`;
  const note = prompt(question, "");
  if(note === null) return;

  item.status = "Returned";
  item.returnedAt = Date.now();
  item.returnedDirect = true;
  if(note.trim()) item.returnNote = note.trim().slice(0, 200);

  if(!saveData(data)) return;

  if(redirectAfter){
    location.reload();
    return;
  }
  if(document.body.dataset.page === "mine") renderMyReports();
}

function undoMatch(reportId){
  const data = loadData();
  const user = getCurrentUser();
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

  if(!canManagePair(first, second, user)){
    alert("You can only undo pairs that include your own report.");
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

  notifyPair(data, user, lost, found, `The match for your report "${first.name}" was undone. It is active again.`);

  if(saveData(data)) renderMatches();
}

/* --------------------------
   NAVBAR, AUTH PAGES, NOTIFICATIONS, ADMIN
-------------------------- */

function buildNav(){
  const nav = document.querySelector(".navlinks");
  if(!nav) return;
  const user = getCurrentUser();

  if(!user){
    nav.innerHTML = `
      <a data-page="login" href="login.html">Login</a>
      <a data-page="register" href="register.html">Register</a>`;
    return;
  }

  const unread = unreadCount(user);
  nav.innerHTML = `
    <a data-page="home" href="index.html">Home</a>
    <a data-page="lost" href="report-lost.html">Report Lost</a>
    <a data-page="found" href="report-found.html">Report Found</a>
    <a data-page="browse" href="browse.html">Browse Items</a>
    <a data-page="matches" href="matches.html">Possible Matches</a>
    <a data-page="mine" href="my-reports.html">My Reports</a>
    <a data-page="notifications" href="notifications.html">🔔 Notifications${unread ? ` (${unread})` : ""}</a>
    ${isAdmin(user) ? `<a data-page="admin" href="admin.html">Admin</a>` : ""}
    <a data-page="about" href="about.html">About</a>
    <a href="#" onclick="logout();return false">Logout (${escapeHTML(user.name.split(" ")[0])})</a>`;
}

function initRegister(){
  const form = document.getElementById("authForm");
  form.addEventListener("submit", e => {
    e.preventDefault();
    clearFormMessage();

    const fd = new FormData(form);
    const name = String(fd.get("name")).trim();
    const email = String(fd.get("email")).trim().toLowerCase();
    const phone = String(fd.get("phone")).trim();
    const password = String(fd.get("password"));
    const confirmPassword = String(fd.get("confirmPassword"));
    const errors = [];

    if(name.length < 2) errors.push("Name must contain at least 2 characters.");
    if(!isValidSeuEmail(email)) errors.push(`Only university emails ending with ${ALLOWED_DOMAIN} can register.`);
    if(!isValidBangladeshPhone(phone)) errors.push("Enter a valid Bangladesh mobile number, for example 01712345678.");
    if(password.length < 6) errors.push("Password must contain at least 6 characters.");
    if(password !== confirmPassword) errors.push("Passwords do not match.");

    const data = loadData();
    if(isValidSeuEmail(email) && data.users.some(u => u.email === email)){
      errors.push("An account with this email already exists.");
    }

    if(errors.length){
      showFormMessage(errors.map(x => `• ${escapeHTML(x)}`).join("<br>"));
      return;
    }

    const user = {
      id: Date.now(),
      name,
      email,
      phone: normalizePhone(phone),
      passwordHash: hashPassword(password),
      role: "student",
      createdAt: Date.now()
    };
    data.users.push(user);
    if(!saveData(data)) return;

    localStorage.setItem(SESSION_KEY, String(user.id));
    location.href = "index.html";
  });
}

function initLogin(){
  const form = document.getElementById("authForm");
  form.addEventListener("submit", e => {
    e.preventDefault();
    clearFormMessage();

    const fd = new FormData(form);
    const email = String(fd.get("email")).trim().toLowerCase();
    const password = String(fd.get("password"));

    if(!isValidSeuEmail(email)){
      showFormMessage(`Only university emails ending with ${ALLOWED_DOMAIN} can log in.`);
      return;
    }

    const user = loadData().users.find(u => u.email === email);
    if(!user || user.passwordHash !== hashPassword(password)){
      showFormMessage("Invalid email or password.");
      return;
    }

    localStorage.setItem(SESSION_KEY, String(user.id));
    location.href = "index.html";
  });
}

function renderNotifications(){
  const user = getCurrentUser();
  const list = loadData().notifications
    .filter(n => n.userId === user.id)
    .sort((a,b) => b.createdAt - a.createdAt);

  document.getElementById("notifList").innerHTML = list.length
    ? list.map(n => `
      <a class="card notif ${n.read ? "" : "unread"}" href="#" onclick="openNotification(${n.id});return false">
        <span>🔔 ${escapeHTML(n.text)}</span>
        <small class="muted">${escapeHTML(new Date(n.createdAt).toLocaleString())}</small>
      </a>`).join("")
    : `<div class="empty"><strong>No notifications yet.</strong>You will be notified when a report may match yours.</div>`;
}

function openNotification(id){
  const data = loadData();
  const n = data.notifications.find(x => x.id === id);
  if(!n) return;
  n.read = true;
  saveData(data);
  location.href = n.link || "notifications.html";
}

function markAllNotificationsRead(){
  const data = loadData();
  const user = getCurrentUser();
  data.notifications.forEach(n => { if(n.userId === user.id) n.read = true; });
  saveData(data);
  renderNotifications();
  buildNav();
  setActiveNav();
}

function renderAdmin(){
  const data = loadData();
  const items = data.items;
  const count = fn => items.filter(fn).length;

  const stats = [
    ["TOTAL USERS", data.users.length],
    ["LOST REPORTS", count(x => x.type === "Lost")],
    ["FOUND REPORTS", count(x => x.type === "Found")],
    ["MATCHED / CLAIMED", count(x => x.status === "Matched" || x.status === "Claimed")],
    ["RETURNED", count(x => x.status === "Returned")],
    ["TOTAL REPORTS", items.length]
  ];
  document.getElementById("adminStats").innerHTML = stats
    .map(([label, value]) => `<div class="card stat"><div class="label">${label}</div><div class="value">${value}</div></div>`)
    .join("");

  const sorted = [...items].sort((a,b) => (b.createdAt || b.id) - (a.createdAt || a.id));
  document.getElementById("adminReports").innerHTML = sorted.length
    ? sorted.map(item => `
      <tr>
        <td>#${item.id}</td>
        <td>${escapeHTML(item.type)}</td>
        <td>${escapeHTML(item.name)}</td>
        <td><span class="badge status-${item.status.toLowerCase()}">${escapeHTML(item.status)}</span></td>
        <td>${escapeHTML(item.ownerName || "Demo data")}</td>
        <td>
          <a class="btn btn-outline btn-small" href="details.html?id=${item.id}">View</a>
          <button class="btn btn-danger btn-small" onclick="adminDeleteReport(${item.id})">Delete</button>
        </td>
      </tr>`).join("")
    : `<tr><td colspan="6">No reports.</td></tr>`;

  document.getElementById("adminUsers").innerHTML = data.users.map(u => `
    <tr>
      <td>${escapeHTML(u.name)}</td>
      <td>${escapeHTML(u.email)}</td>
      <td>${escapeHTML(u.phone)}</td>
      <td>${escapeHTML(u.role)}</td>
      <td>${items.filter(x => x.ownerId === u.id).length}</td>
    </tr>`).join("");
}

function adminDeleteReport(id){
  if(!isAdmin()) return;
  const data = loadData();
  const item = data.items.find(x => x.id === id);
  if(!item) return;

  if(!confirm(`Delete report #${item.id} "${item.name}"? This cannot be undone.`)) return;

  const other = data.items.find(x => x.id === item.matchedWith);
  if(other){
    delete other.matchedWith;
    delete other.matchedAt;
    if(other.status !== "Returned") other.status = other.type;
    notify(data, other.ownerId, `The report connected to your "${other.name}" report was removed by an admin. Your report is active again.`, "details.html?id=" + other.id);
  }
  notify(data, item.ownerId, `Your report "${item.name}" was removed by an admin.`, "my-reports.html");

  data.items = data.items.filter(x => x.id !== id);
  if(saveData(data)) renderAdmin();
}

const FB_BLOCKED = !guardPage(document.body.dataset.page);

document.addEventListener("DOMContentLoaded", () => {
  if(FB_BLOCKED) return;

  buildNav();
  setActiveNav();

  const page = document.body.dataset.page;

  if(page === "login") initLogin();
  if(page === "register") initRegister();
  if(page === "home") renderHome();
  if(page === "lost") initReportForm("Lost");
  if(page === "found") initReportForm("Found");
  if(page === "browse") initBrowse();
  if(page === "matches") renderMatches();
  if(page === "mine") renderMyReports();
  if(page === "details") renderDetails();
  if(page === "edit") initEditReport();
  if(page === "notifications") renderNotifications();
  if(page === "admin") renderAdmin();
});
