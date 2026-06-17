// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyAYbLmshMYCNMTCfvD5W5m8m0iG8uDcb7c",
  authDomain: "mavis-badmintion-academy.firebaseapp.com",
  databaseURL: "https://mavis-badmintion-academy-default-rtdb.firebaseio.com",
  projectId: "mavis-badmintion-academy",
  storageBucket: "mavis-badmintion-academy.firebasestorage.app",
  messagingSenderId: "153635676888",
  appId: "1:153635676888:web:b11d0bad5655e0078aadad",
  measurementId: "G-BS8PJQDXZF"
};

// Initialize Firebase
let db;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
} catch (e) {
  console.error("Firebase connection initialization failed in admin dashboard", e);
}

document.addEventListener('DOMContentLoaded', () => {
  initAdminTabs();
  
  if (db) {
    loadBookings();
    loadTournaments();
    loadRegistrations();
    loadInquiries();
    loadGallery();
    loadSettings();
    seedTournamentsIfEmpty();
    seedGalleryIfEmpty();
    
    // Bind modal submit listeners
    initModalFormListeners();
  } else {
    showToast("Database is offline. Check internet connection.", "error");
  }
});

// Helper: Admin Toast
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <svg style="width: 20px; height: 20px; fill: currentColor;" viewBox="0 0 24 24">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
    </svg>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

// Helper: Extract YouTube video ID from ANY YouTube URL format
function getYouTubeId(url) {
  if (!url) return null;
  let m = url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  m = url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  m = url.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  m = url.match(/^([A-Za-z0-9_-]{11})$/);
  if (m) return m[1];
  return null;
}

// Helper: Fetch content using multiple public CORS proxies as fallbacks
function fetchWithCORSProxy(url) {
  const proxies = [
    `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`
  ];
  
  return new Promise((resolve, reject) => {
    let currentProxyIndex = 0;
    
    function tryFetch() {
      if (currentProxyIndex >= proxies.length) {
        reject(new Error("All CORS proxies failed"));
        return;
      }
      
      const proxyUrl = proxies[currentProxyIndex];
      fetch(proxyUrl)
        .then(response => {
          if (!response.ok) throw new Error("Proxy error");
          if (proxyUrl.includes('allorigins.win')) {
            return response.json().then(data => data.contents);
          } else {
            return response.text();
          }
        })
        .then(html => {
          if (!html) throw new Error("Empty content");
          resolve(html);
        })
        .catch(err => {
          console.warn(`Proxy ${currentProxyIndex} failed, trying next...`, err);
          currentProxyIndex++;
          tryFetch();
        });
    }
    
    tryFetch();
  });
}

// Helper: Resolve ImgBB viewer link to direct image link via CORS proxies
function resolveImgBBUrl(url) {
  return new Promise((resolve) => {
    if (!url || !url.includes('ibb.co/') || url.includes('i.ibb.co/')) {
      resolve(url);
      return;
    }
    
    fetchWithCORSProxy(url)
      .then(html => {
        const match = html.match(/<meta property="og:image" content="([^"]+)"/);
        if (match && match[1]) {
          resolve(match[1]);
        } else {
          const linkMatch = html.match(/<link rel="image_src" href="([^"]+)"/);
          if (linkMatch && linkMatch[1]) {
            resolve(linkMatch[1]);
          } else {
            resolve(url);
          }
        }
      })
      .catch(err => {
        console.error("Error resolving ImgBB URL:", err);
        resolve(url);
      });
  });
}


// --- ADMIN TABS TRANSITIONS ---
function initAdminTabs() {
  const menuItems = document.querySelectorAll('.admin-menu-item');
  const panels = document.querySelectorAll('.admin-panel');

  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      menuItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      const targetId = item.getAttribute('data-tab');
      panels.forEach(panel => {
        panel.classList.remove('active');
        if (panel.getAttribute('id') === targetId) {
          panel.classList.add('active');
        }
      });
    });
  });
}

// --- MODAL TRIGGER HELPERS ---
function openModal(modalId) {
  document.getElementById('modal-overlay').classList.add('active');
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById('modal-overlay').classList.remove('active');
  document.getElementById(modalId).classList.remove('active');
}

function closeAllModals() {
  document.getElementById('modal-overlay').classList.remove('active');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
}

// --- 1. COURT RESERVATIONS MANAGEMENT (CRUD) ---
function loadBookings() {
  const tbody = document.getElementById('admin-bookings-tbody');
  if (!tbody) return;

  db.ref('bookings').on('value', (snapshot) => {
    tbody.innerHTML = '';
    const bookings = snapshot.val() || {};
    const keys = Object.keys(bookings);

    if (keys.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:20px;">No court reservations logged.</td></tr>';
      return;
    }

    // Newest bookings first
    [...keys].reverse().forEach(key => {
      const b = bookings[key];
      const row = document.createElement('tr');
      
      let statusClass = 'available'; // pending
      if (b.status === 'Approved') statusClass = 'confirmed';
      if (b.status === 'Cancelled') statusClass = 'maintenance';

      row.innerHTML = `
        <td style="font-weight:600; color:var(--text-main);">${b.name}</td>
        <td><a href="tel:${b.phone}" style="color:var(--primary); text-decoration:underline;">${b.phone}</a></td>
        <td>${b.court}</td>
        <td>${b.date}</td>
        <td>${b.slot}</td>
        <td><span class="badge-status ${statusClass}">${b.status}</span></td>
        <td>
          <button class="action-btn btn-edit" onclick="openEditBookingModal('${key}')">Edit</button>
          ${b.status === 'Pending Approval' ? `
            <button class="action-btn btn-approve" onclick="updateBookingStatus('${key}', 'Approved')">Approve</button>
            <button class="action-btn btn-cancel" onclick="updateBookingStatus('${key}', 'Cancelled')">Cancel</button>
          ` : ''}
          <button class="action-btn btn-delete" onclick="deleteBookingRecord('${key}')">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  });

  // Action status updates
  window.updateBookingStatus = function(key, newStatus) {
    db.ref(`bookings/${key}`).update({ status: newStatus }).then(() => {
      showToast(`Booking ${newStatus.toLowerCase()} successfully!`);
    }).catch(err => {
      console.error(err);
      showToast("Failed to update booking status.", "error");
    });
  };

  window.deleteBookingRecord = function(key) {
    if (confirm("Are you sure you want to delete this booking log?")) {
      db.ref(`bookings/${key}`).remove().then(() => {
        showToast("Booking record deleted.");
      });
    }
  };

  // Clear bookings database
  document.getElementById('admin-clear-bookings-btn').addEventListener('click', () => {
    if (confirm("Are you sure you want to clear all booking records? This resets slot states.")) {
      db.ref('bookings').remove().then(() => {
        showToast("Bookings database cleared.");
      });
    }
  });
}

// Open/Fill Booking Modals
window.openCreateBookingModal = function() {
  document.getElementById('booking-modal-title').innerText = "Add New Booking";
  document.getElementById('booking-edit-key').value = "";
  document.getElementById('booking-modal-form').reset();
  
  // Set default date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('book-date-input').value = today;
  
  openModal('booking-modal');
};

window.openEditBookingModal = function(key) {
  document.getElementById('booking-modal-title').innerText = "Edit Booking Details";
  document.getElementById('booking-edit-key').value = key;
  
  db.ref(`bookings/${key}`).once('value').then(snapshot => {
    const b = snapshot.val();
    if (b) {
      document.getElementById('book-name-input').value = b.name || "";
      document.getElementById('book-phone-input').value = b.phone || "";
      document.getElementById('book-court-input').value = b.court || "Court 1 (Synthetic)";
      document.getElementById('book-date-input').value = b.date || "";
      document.getElementById('book-slot-input').value = b.slot || "";
      document.getElementById('book-status-input').value = b.status || "Pending Approval";
      
      openModal('booking-modal');
    }
  });
};

// --- 2. TOURNAMENTS & ACHIEVEMENTS MANAGEMENT (CRUD) ---
function loadTournaments() {
  const tbody = document.getElementById('admin-tournaments-tbody');
  const form = document.getElementById('tournament-form');
  if (!tbody || !form) return;

  // Render list
  db.ref('tournaments').on('value', (snapshot) => {
    // Read registrations once to count signup records
    db.ref('tournament_registrations').once('value').then((regSnapshot) => {
      tbody.innerHTML = '';
      const tournaments = snapshot.val() || {};
      const registrations = regSnapshot.val() || {};
      const keys = Object.keys(tournaments);

      if (keys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px;">No achievements added.</td></tr>';
        return;
      }

      [...keys].reverse().forEach(key => {
        const t = tournaments[key] ? { ...tournaments[key], imageUrl: extractDirectUrl(tournaments[key].imageUrl || "") } : {};
        
        // Count registrations
        let signupCount = 0;
        if (t.category === 'Upcoming') {
          Object.keys(registrations).forEach(regKey => {
            if (registrations[regKey].eventTitle === t.title) {
              signupCount++;
            }
          });
        }

        const signupBadge = t.category === 'Upcoming' 
          ? `<span class="badge-status confirmed" style="font-size:0.7rem; padding: 2px 8px; margin-left: 8px; cursor: pointer;" title="Click to view signups" onclick="switchToRegistrationsTab('${t.title.replace(/'/g, "\\'")}')">${signupCount} Signup${signupCount !== 1 ? 's' : ''}</span>`
          : '';

        const row = document.createElement('tr');
        row.innerHTML = `
          <td style="font-weight:700; color:var(--primary);">${t.category}</td>
          <td style="font-weight:600; color:var(--text-main);">${t.title}${signupBadge}</td>
          <td>${t.description}</td>
          <td><a href="${t.imageUrl}" target="_blank" style="color:var(--accent); text-decoration:underline; font-size:0.8rem; word-break:break-all;">View Image Link</a></td>
          <td>
            <button class="action-btn btn-edit" onclick="editTournament('${key}')">Edit</button>
            <button class="action-btn btn-cancel" onclick="deleteTournament('${key}')">Delete</button>
          </td>
        `;
        tbody.appendChild(row);
      });
    });
  });

  // Category change listener to update placeholders automatically
  const categorySelect = document.getElementById('tournament-category');
  const titleInput = document.getElementById('tournament-title');
  const descInput = document.getElementById('tournament-desc');

  categorySelect.addEventListener('change', () => {
    if (categorySelect.value === 'Winner') {
      titleInput.placeholder = "e.g. Under-17 Doubles Champions";
      descInput.placeholder = "e.g. Winners: Vignesh & Sanjay | Date: July 12";
    } else {
      titleInput.placeholder = "e.g. Gobi Summer Smash 2026";
      descInput.placeholder = "e.g. Date: July 28, 2026 | Categories: U-19 and Adults";
    }
  });

  // Preset Image click helper binded globally
  window.setImagePreset = function(url) {
    document.getElementById('tournament-img').value = url;
    showToast("Preset image URL applied!");
  };

  // Nav filter and registrations switcher
  window.switchToRegistrationsTab = function(filterTitle) {
    const regItem = document.querySelector('.admin-menu-item[data-tab="registrations-panel"]');
    if (regItem) {
      regItem.click(); // Switch panel tab
      
      const regTbody = document.getElementById('admin-registrations-tbody');
      if (regTbody) {
        const rows = regTbody.querySelectorAll('tr');
        rows.forEach(row => {
          const statusBadge = row.querySelector('.badge-status');
          if (statusBadge) {
            const text = statusBadge.innerText.trim();
            if (text === filterTitle) {
              row.style.display = '';
              row.style.background = 'rgba(163, 230, 53, 0.08)'; // highlight match row
            } else {
              row.style.display = 'none'; // hide others
            }
          }
        });

        // Add filter reset UI dynamically if missing
        let resetBtn = document.getElementById('reg-filter-reset-btn');
        if (!resetBtn) {
          resetBtn = document.createElement('button');
          resetBtn.id = 'reg-filter-reset-btn';
          resetBtn.className = 'btn btn-secondary';
          resetBtn.style.padding = '6px 12px';
          resetBtn.style.fontSize = '0.75rem';
          resetBtn.style.marginLeft = '12px';
          resetBtn.innerText = 'Reset Filter';
          resetBtn.onclick = () => {
            rows.forEach(r => {
              r.style.display = '';
              r.style.background = '';
            });
            resetBtn.remove();
          };
          const header = document.querySelector('#registrations-panel .admin-header div');
          if (header) {
            header.appendChild(resetBtn);
          }
        }
      }
    }
  };

  // Handle Add/Update Tournament Submit
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const key = document.getElementById('tournament-edit-key').value;
    const category = document.getElementById('tournament-category').value;
    const title = document.getElementById('tournament-title').value.trim();
    const description = document.getElementById('tournament-desc').value.trim();
    const imageUrl = document.getElementById('tournament-img').value.trim();

    if (!category || !title || !description || !imageUrl) {
      showToast("Please fill in all inputs", "error");
      return;
    }

    const tData = {
      category,
      title,
      description,
      imageUrl,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    if (key) {
      // Update
      db.ref(`tournaments/${key}`).update(tData).then(() => {
        showToast("Tournament achievement updated successfully!");
        cancelTournamentEdit();
      }).catch(err => {
        console.error(err);
        showToast("Failed to update tournament.", "error");
      });
    } else {
      // Create
      tData.createdAt = firebase.database.ServerValue.TIMESTAMP;
      db.ref('tournaments').push(tData).then(() => {
        showToast("Tournament uploaded successfully!");
        form.reset();
      }).catch(err => {
        console.error(err);
        showToast("Failed to upload entry.", "error");
      });
    }
  });

  window.editTournament = function(key) {
    db.ref(`tournaments/${key}`).once('value').then(snapshot => {
      const t = snapshot.val();
      if (t) {
        document.getElementById('tournament-edit-key').value = key;
        document.getElementById('tournament-category').value = t.category;
        document.getElementById('tournament-title').value = t.title;
        document.getElementById('tournament-desc').value = t.description;
        document.getElementById('tournament-img').value = t.imageUrl;
        
        document.getElementById('tournament-form-title').innerText = "Edit Tournament Achievement Details";
        document.getElementById('tournament-submit-btn').innerText = "Update Tournament Info";
        document.getElementById('tournament-cancel-btn').style.display = "inline-flex";
        
        // Scroll to form smoothly
        document.getElementById('tournament-form').scrollIntoView({ behavior: 'smooth' });
      }
    });
  };

  window.cancelTournamentEdit = function() {
    document.getElementById('tournament-edit-key').value = "";
    document.getElementById('tournament-form').reset();
    document.getElementById('tournament-form-title').innerText = "Add New Entry";
    document.getElementById('tournament-submit-btn').innerText = "Upload Tournament Info";
    document.getElementById('tournament-cancel-btn').style.display = "none";
  };

  window.deleteTournament = function(key) {
    if (confirm("Are you sure you want to delete this tournament entry?")) {
      db.ref(`tournaments/${key}`).remove().then(() => {
        showToast("Tournament entry removed.");
      });
    }
  };

  // Bind Clear All Entries Action
  const clearTournamentsBtn = document.getElementById('admin-clear-tournaments-btn');
  if (clearTournamentsBtn) {
    clearTournamentsBtn.addEventListener('click', () => {
      if (confirm("Are you sure you want to clear all tournament entries? This will delete all winners and upcoming matches from the database.")) {
        db.ref('tournaments').remove().then(() => {
          showToast("Tournaments database cleared.");
        });
      }
    });
  }
}

// --- 3. TOURNAMENT SIGNUPS REGISTRATIONS ---
function loadRegistrations() {
  const tbody = document.getElementById('admin-registrations-tbody');
  const clearBtn = document.getElementById('admin-clear-registrations-btn');
  if (!tbody) return;

  db.ref('tournament_registrations').on('value', (snapshot) => {
    tbody.innerHTML = '';
    const registrations = snapshot.val() || {};
    const keys = Object.keys(registrations);

    if (keys.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">No player registrations submitted yet.</td></tr>';
      return;
    }

    [...keys].reverse().forEach(key => {
      const r = registrations[key];
      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="font-weight:600; color:var(--text-main);">${r.name}</td>
        <td><a href="tel:${r.phone}" style="color:var(--primary); text-decoration:underline;">${r.phone}</a></td>
        <td><a href="mailto:${r.email}" style="color:var(--accent); text-decoration:underline;">${r.email}</a></td>
        <td><span class="badge-status confirmed">${r.eventTitle}</span></td>
        <td>${r.notes || '<span style="color:var(--text-muted); opacity:0.5;">None</span>'}</td>
        <td>
          <button class="action-btn btn-edit" onclick="openEditRegistrationModal('${key}')">Edit</button>
          <button class="action-btn btn-cancel" onclick="deleteRegistration('${key}')">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  });

  window.openEditRegistrationModal = function(key) {
    document.getElementById('registration-edit-key').value = key;
    db.ref(`tournament_registrations/${key}`).once('value').then(snapshot => {
      const r = snapshot.val();
      if (r) {
        document.getElementById('reg-name-input').value = r.name || "";
        document.getElementById('reg-phone-input').value = r.phone || "";
        document.getElementById('reg-email-input').value = r.email || "";
        document.getElementById('reg-title-input').value = r.eventTitle || "";
        document.getElementById('reg-notes-input').value = r.notes || "";
        
        openModal('registration-modal');
      }
    });
  };

  window.deleteRegistration = function(key) {
    if (confirm("Are you sure you want to delete this tournament signup registration?")) {
      db.ref(`tournament_registrations/${key}`).remove().then(() => {
        showToast("Signup registration removed.");
      });
    }
  };

  clearBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to clear all tournament registrations?")) {
      db.ref('tournament_registrations').remove().then(() => {
        showToast("Registrations records cleared.");
      });
    }
  });
}

// --- 4. CUSTOMER INQUIRIES MODERATION (CRUD) ---
function loadInquiries() {
  const tbody = document.getElementById('admin-inquiries-tbody');
  const clearBtn = document.getElementById('admin-clear-inquiries-btn');
  if (!tbody) return;

  db.ref('inquiries').on('value', (snapshot) => {
    tbody.innerHTML = '';
    const inquiries = snapshot.val() || {};
    const keys = Object.keys(inquiries);

    if (keys.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">No customer inquiries received.</td></tr>';
      return;
    }

    [...keys].reverse().forEach(key => {
      const i = inquiries[key];
      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="font-weight:600; color:var(--text-main);">${i.name}</td>
        <td><a href="tel:${i.phone}" style="color:var(--primary); text-decoration:underline;">${i.phone}</a></td>
        <td><a href="mailto:${i.email}" style="color:var(--accent); text-decoration:underline;">${i.email}</a></td>
        <td><span class="badge-status available">${i.batch}</span></td>
        <td style="max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${i.message}">${i.message}</td>
        <td>
          <button class="action-btn btn-edit" onclick="openEditInquiryModal('${key}')">Edit</button>
          <button class="action-btn btn-delete" onclick="deleteInquiry('${key}')">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  });

  window.openCreateInquiryModal = function() {
    document.getElementById('inquiry-modal-title').innerText = "Add New Inquiry Record";
    document.getElementById('inquiry-edit-key').value = "";
    document.getElementById('inquiry-modal-form').reset();
    openModal('inquiry-modal');
  };

  window.openEditInquiryModal = function(key) {
    document.getElementById('inquiry-modal-title').innerText = "Edit Inquiry details";
    document.getElementById('inquiry-edit-key').value = key;
    
    db.ref(`inquiries/${key}`).once('value').then(snapshot => {
      const i = snapshot.val();
      if (i) {
        document.getElementById('inq-name-input').value = i.name || "";
        document.getElementById('inq-phone-input').value = i.phone || "";
        document.getElementById('inq-email-input').value = i.email || "";
        document.getElementById('inq-batch-input').value = i.batch || "General Enquiry";
        document.getElementById('inq-message-input').value = i.message || "";
        
        openModal('inquiry-modal');
      }
    });
  };

  window.deleteInquiry = function(key) {
    if (confirm("Are you sure you want to delete this customer inquiry?")) {
      db.ref(`inquiries/${key}`).remove().then(() => {
        showToast("Inquiry deleted.");
      });
    }
  };

  clearBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to clear all inquiries?")) {
      db.ref('inquiries').remove().then(() => {
        showToast("Inquiries cleared.");
      });
    }
  });
}



// --- 6. BIND MODAL FORM SUBMIT INTERRUPTS ---
function initModalFormListeners() {
  // Bookings Submit
  document.getElementById('booking-modal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const key = document.getElementById('booking-edit-key').value;
    const name = document.getElementById('book-name-input').value.trim();
    const phone = document.getElementById('book-phone-input').value.trim();
    const court = document.getElementById('book-court-input').value;
    const date = document.getElementById('book-date-input').value;
    const slot = document.getElementById('book-slot-input').value;
    const status = document.getElementById('book-status-input').value;

    const bData = {
      name, phone, court, date, slot, status,
      price: 500, // standard pricing
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    if (key) {
      db.ref(`bookings/${key}`).update(bData).then(() => {
        showToast("Court booking details updated.");
        closeModal('booking-modal');
      });
    } else {
      bData.createdAt = firebase.database.ServerValue.TIMESTAMP;
      db.ref('bookings').push(bData).then(() => {
        showToast("New booking logged successfully.");
        closeModal('booking-modal');
      });
    }
  });

  // Tournament Registration Submit
  document.getElementById('registration-modal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const key = document.getElementById('registration-edit-key').value;
    const name = document.getElementById('reg-name-input').value.trim();
    const phone = document.getElementById('reg-phone-input').value.trim();
    const email = document.getElementById('reg-email-input').value.trim();
    const eventTitle = document.getElementById('reg-title-input').value.trim();
    const notes = document.getElementById('reg-notes-input').value.trim();

    const rData = {
      name, phone, email, eventTitle, notes,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    db.ref(`tournament_registrations/${key}`).update(rData).then(() => {
      showToast("Signup registration details updated.");
      closeModal('registration-modal');
    });
  });

  // Inquiry Submit
  document.getElementById('inquiry-modal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const key = document.getElementById('inquiry-edit-key').value;
    const name = document.getElementById('inq-name-input').value.trim();
    const phone = document.getElementById('inq-phone-input').value.trim();
    const email = document.getElementById('inq-email-input').value.trim();
    const batch = document.getElementById('inq-batch-input').value;
    const message = document.getElementById('inq-message-input').value.trim();

    const iData = {
      name, phone, email, batch, message,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    if (key) {
      db.ref(`inquiries/${key}`).update(iData).then(() => {
        showToast("Inquiry details updated.");
        closeModal('inquiry-modal');
      });
    } else {
      iData.createdAt = firebase.database.ServerValue.TIMESTAMP;
      db.ref('inquiries').push(iData).then(() => {
        showToast("Inquiry logged manually.");
        closeModal('inquiry-modal');
      });
    }
  });

}

// --- 7. SETTINGS CONFIGURATION ---
function loadSettings() {
  const c1Status = document.getElementById('settings-court1-status');
  const c2Status = document.getElementById('settings-court2-status');
  const priceSynthetic = document.getElementById('settings-price-synthetic');
  const saveBtn = document.getElementById('save-settings-btn');
  
  const c1Text = document.getElementById('court1-status-text');
  const c2Text = document.getElementById('court2-status-text');

  if (!c1Status || !saveBtn) return;

  // Sync settings values once from Firebase settings ref
  db.ref('settings').once('value').then((snapshot) => {
    const s = snapshot.val();
    if (s) {
      c1Status.checked = s.court1Active !== false;
      c2Status.checked = s.court2Active !== false;
      priceSynthetic.value = s.priceSynthetic || 500;
      
      updateStatusTexts();
    }
  });

  // Toggles text updates
  c1Status.addEventListener('change', updateStatusTexts);
  c2Status.addEventListener('change', updateStatusTexts);

  function updateStatusTexts() {
    c1Text.innerText = c1Status.checked ? 'Active' : 'Maintenance';
    c1Text.style.color = c1Status.checked ? 'var(--primary)' : '#ef4444';
    
    c2Text.innerText = c2Status.checked ? 'Active' : 'Maintenance';
    c2Text.style.color = c2Status.checked ? 'var(--primary)' : '#ef4444';
  }

  // Save Settings Click
  saveBtn.addEventListener('click', () => {
    const rate = parseInt(priceSynthetic.value);
    const c1Active = c1Status.checked;
    const c2Active = c2Status.checked;

    if (isNaN(rate) || rate < 0) {
      showToast("Please enter a valid price rate", "error");
      return;
    }

    const settingsData = {
      priceSynthetic: rate,
      court1Active: c1Active,
      court2Active: c2Active
    };

    db.ref('settings').set(settingsData).then(() => {
      showToast("Academy settings saved successfully!");
    }).catch(err => {
      console.error(err);
      showToast("Failed to save settings.", "error");
    });
  });
}

// Seed initial tournament winners/upcoming data if empty
function seedTournamentsIfEmpty() {
  db.ref('seeded/tournaments').once('value').then(seededSnapshot => {
    if (seededSnapshot.val()) return; // Already seeded before, don't auto-recreate if user deleted

    db.ref('tournaments').once('value').then(snapshot => {
      if (!snapshot.exists()) {
        const seedData = [
          {
            category: "Winner",
            title: "Gobichettipalayam Junior Championship",
            description: "Winner: Gokul R. (Under-15 Singles) | Date: May 2026",
            imageUrl: "assets/hero_badminton.png",
            createdAt: firebase.database.ServerValue.TIMESTAMP
          },
          {
            category: "Winner",
            title: "District Doubles Smash Cup",
            description: "Winners: Vignesh K. & Sanjay R. | Date: June 22, 2026",
            imageUrl: "assets/indoor_courts.png",
            createdAt: firebase.database.ServerValue.TIMESTAMP
          },
          {
            category: "Upcoming",
            title: "Mavis Summer Smash Cup",
            description: "Date: July 28, 2026 | Age Category: U-19 and Adults",
            imageUrl: "assets/coaching_kids.png",
            createdAt: firebase.database.ServerValue.TIMESTAMP
          }
        ];
        
        let promises = seedData.map(t => db.ref('tournaments').push(t));
        Promise.all(promises).then(() => {
          db.ref('seeded/tournaments').set(true);
        });
      } else {
        db.ref('seeded/tournaments').set(true);
      }
    });
  });
}

// Seed initial gallery media if empty
function seedGalleryIfEmpty() {
  db.ref('seeded/gallery').once('value').then(seededSnapshot => {
    if (seededSnapshot.val()) return; // Already seeded before

    db.ref('gallery').once('value').then(snapshot => {
      if (!snapshot.exists()) {
        const seedData = [
          {
            type: "video",
            title: "Mavis Badminton Academy Glimpse",
            url: "https://youtu.be/nffLXODytdw?si=bgaEJooG3tlVWEC0",
            createdAt: firebase.database.ServerValue.TIMESTAMP
          }
        ];
        
        let promises = seedData.map(item => db.ref('gallery').push(item));
        Promise.all(promises).then(() => {
          db.ref('seeded/gallery').set(true);
        });
      } else {
        db.ref('seeded/gallery').set(true);
      }
    });
  });
}

// Helper to extract direct URL from HTML format if present
function extractDirectUrl(url) {
  if (!url) return "";
  const trimmed = url.trim();
  if (trimmed.startsWith('<') && trimmed.includes('>')) {
    const srcMatch = trimmed.match(/src=["']([^"']+)["']/i);
    if (srcMatch && srcMatch[1]) {
      return srcMatch[1];
    }
    const hrefMatch = trimmed.match(/href=["']([^"']+)["']/i);
    if (hrefMatch && hrefMatch[1]) {
      return hrefMatch[1];
    }
  }
  return trimmed;
}

// --- 8. GALLERY MANAGEMENT ---
function loadGallery() {
  const tbody = document.getElementById('admin-gallery-tbody');
  const form = document.getElementById('admin-gallery-form');
  const clearBtn = document.getElementById('admin-clear-gallery-btn');
  if (!tbody || !form) return;

  // Real-time Database listener for gallery items
  db.ref('gallery').on('value', (snapshot) => {
    tbody.innerHTML = '';
    const items = snapshot.val() || {};
    const keys = Object.keys(items);

    if (keys.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px;">No gallery media items found.</td></tr>';
      return;
    }

    // Display newest first
    [...keys].reverse().forEach(key => {
      const item = items[key] ? { ...items[key], url: extractDirectUrl(items[key].url || "") } : {};
      const row = document.createElement('tr');
      
      // Preview setup
      let previewHtml = '';
      if (item.type === 'video') {
        const ytId = getYouTubeId(item.url);
        if (ytId) {
          previewHtml = `<img src="https://img.youtube.com/vi/${ytId}/default.jpg" style="width: 80px; height: 50px; object-fit: cover; border-radius: 4px;">`;
        } else {
          previewHtml = `<span style="font-size: 1.2rem;">📹</span>`;
        }
      } else {
        const isImgBBViewer = item.url.includes('ibb.co/') && !item.url.includes('i.ibb.co/');
        const imgId = `admin-gallery-img-${key}`;
        previewHtml = `<img id="${imgId}" src="${isImgBBViewer ? 'assets/hero_badminton.png' : item.url}" style="width: 80px; height: 50px; object-fit: cover; border-radius: 4px;" onerror="this.src='assets/hero_badminton.png'">`;
        
        if (isImgBBViewer) {
          resolveImgBBUrl(item.url).then(directUrl => {
            const imgEl = document.getElementById(imgId);
            if (imgEl && directUrl) imgEl.src = directUrl;
          });
        }
      }

      row.innerHTML = `
        <td>${previewHtml}</td>
        <td style="font-weight:600; color:var(--text-main);">${item.title}</td>
        <td><span class="badge-status ${item.type === 'video' ? 'confirmed' : 'available'}" style="font-size: 0.75rem;">${item.type}</span></td>
        <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><a href="${item.url}" target="_blank" style="color:var(--accent); text-decoration:underline;">${item.url}</a></td>
        <td>
          <button class="action-btn btn-edit" onclick="editGalleryRecord('${key}')">Edit</button>
          <button class="action-btn btn-cancel" onclick="deleteGalleryRecord('${key}')">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  });

  // Form submission
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const key = document.getElementById('gallery-edit-key').value;
    const type = document.getElementById('gallery-item-type').value;
    const title = document.getElementById('gallery-item-title').value.trim();
    const url = document.getElementById('gallery-item-url').value.trim();

    if (!title || !url) {
      showToast("Please fill in all details", "error");
      return;
    }

    const mediaData = {
      type,
      title,
      url,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    };

    if (key) {
      // Update existing
      db.ref(`gallery/${key}`).update(mediaData).then(() => {
        showToast("Gallery media updated successfully!");
        cancelGalleryEdit();
      }).catch(err => {
        console.error(err);
        showToast("Failed to update media.", "error");
      });
    } else {
      // Create new
      mediaData.createdAt = firebase.database.ServerValue.TIMESTAMP;
      db.ref('gallery').push(mediaData).then(() => {
        showToast("Media uploaded to gallery successfully!");
        form.reset();
      }).catch(err => {
        console.error(err);
        showToast("Failed to upload media.", "error");
      });
    }
  });

  // Edit record globally bound
  window.editGalleryRecord = function(key) {
    db.ref(`gallery/${key}`).once('value').then(snapshot => {
      const item = snapshot.val();
      if (item) {
        document.getElementById('gallery-edit-key').value = key;
        document.getElementById('gallery-item-type').value = item.type;
        document.getElementById('gallery-item-title').value = item.title;
        document.getElementById('gallery-item-url').value = item.url;

        document.getElementById('gallery-form-title').innerText = "Edit Gallery Media Item";
        document.getElementById('gallery-submit-btn').innerText = "Update Media Item";
        document.getElementById('gallery-cancel-btn').style.display = "inline-flex";

        // Scroll to form smoothly
        document.getElementById('admin-gallery-form').scrollIntoView({ behavior: 'smooth' });
      }
    });
  };

  // Cancel edit globally bound
  window.cancelGalleryEdit = function() {
    document.getElementById('gallery-edit-key').value = "";
    document.getElementById('admin-gallery-form').reset();
    document.getElementById('gallery-form-title').innerText = "Add Media Item";
    document.getElementById('gallery-submit-btn').innerText = "Upload Media to Gallery";
    document.getElementById('gallery-cancel-btn').style.display = "none";
  };

  // Delete record globally bound
  window.deleteGalleryRecord = function(key) {
    if (confirm("Are you sure you want to delete this media item? It will be removed from the gallery page.")) {
      db.ref(`gallery/${key}`).remove().then(() => {
        showToast("Media item removed from gallery.");
      }).catch(err => {
        console.error(err);
        showToast("Failed to delete media item.", "error");
      });
    }
  };

  // Clear all gallery items
  clearBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to delete all gallery items? This cannot be undone.")) {
      db.ref('gallery').remove().then(() => {
        showToast("Gallery database cleared.");
      }).catch(err => {
        console.error(err);
        showToast("Failed to clear gallery.", "error");
      });
    }
  });
}
