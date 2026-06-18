// Firebase Configuration provided by USER
const firebaseConfig = {
  apiKey: "AIzaSyAjgGscVnXPCxNd3odkB_T1yRftXr2xMPs",
  authDomain: "mavis-badminton-academy.firebaseapp.com",
  databaseURL: "https://mavis-badminton-academy-default-rtdb.firebaseio.com",
  projectId: "mavis-badminton-academy",
  storageBucket: "mavis-badminton-academy.firebasestorage.app",
  messagingSenderId: "654467997223",
  appId: "1:654467997223:web:e7b2622fc2d438944cf802",
  measurementId: "G-YJF16NHQDV"
};

// Initialize Firebase compat
let db;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
} catch (e) {
  console.error("Firebase Initialization Error: Make sure scripts are loaded.", e);
}

// Global Config
const OWNER_PHONE = "919842799975"; // User's WhatsApp phone number for booking redirects

// Helper: Get local date in YYYY-MM-DD
function getLocalYYYYMMDD(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper: Get slot start hour in 24h format
function getSlotStartHour24(slotStr) {
  const startPart = slotStr.split(' - ')[0]; // "05:00 AM"
  const timeAndMeridian = startPart.split(' '); // ["05:00", "AM"]
  const timeParts = timeAndMeridian[0].split(':'); // ["05", "00"]
  let hour = parseInt(timeParts[0]);
  const meridian = timeAndMeridian[1];
  
  if (meridian === 'PM' && hour !== 12) {
    hour += 12;
  } else if (meridian === 'AM' && hour === 12) {
    hour = 0;
  }
  return hour;
}

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initBookingSimulator();
  initContactForm();
  initReviewsAndRatings();
  initScrollAnimations();
});

// Helper: Global UI Toast
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
  }, 3500);
}

// --- NAVBAR SCROLL & MOBILE TOGGLE ---
function initNavbar() {
  const navbar = document.getElementById('navbar');
  const navToggle = document.getElementById('nav-toggle');
  const navLinks = document.getElementById('nav-links');
  const links = navLinks.querySelectorAll('a');

  // Change background on scroll
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }

    // Scroll active link highlight
    let current = '';
    const sections = document.querySelectorAll('section, header');
    sections.forEach(section => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.clientHeight;
      if (window.scrollY >= sectionTop - 150) {
        current = section.getAttribute('id');
      }
    });

    links.forEach(a => {
      a.classList.remove('active');
      if (a.getAttribute('href') === `#${current}`) {
        a.classList.add('active');
      }
    });
  });

  // Mobile menu toggle
  navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('active');
    navToggle.classList.toggle('open');
  });

  // Close mobile menu on click link
  links.forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('active');
      navToggle.classList.remove('open');
    });
  });
}

// --- REAL-TIME BOOKING SYSTEM (FIREBASE DRIVEN) ---
let selectedCourt = '';
let selectedDate = '';
let selectedSlot = '';
let courtPrice = 500;

function initBookingSimulator() {
  const courtTabs = document.getElementById('court-tabs');
  const calendarDays = document.getElementById('calendar-days');
  const slotsGrid = document.getElementById('slots-grid');
  
  const bookNameInput = document.getElementById('book-name');
  const bookPhoneInput = document.getElementById('book-phone');
  const confirmBtn = document.getElementById('confirm-booking-btn');

  const summaryCourt = document.getElementById('summary-court');
  const summaryDate = document.getElementById('summary-date');
  const summarySlot = document.getElementById('summary-slot');
  const summaryTotalPrice = document.getElementById('summary-total-price');

  // Load default court
  const activeTab = courtTabs.querySelector('.court-tab.active');
  selectedCourt = activeTab.getAttribute('data-court');
  courtPrice = parseInt(activeTab.getAttribute('data-price'));

  // Listen to Admin settings in Real-Time to block maintenance courts and sync pricing!
  if (db) {
    db.ref('settings').on('value', (snapshot) => {
      const s = snapshot.val();
      if (!s) return;

      const rate = s.priceSynthetic || 500;
      
      courtTabs.querySelectorAll('.court-tab').forEach(tab => {
        const cName = tab.getAttribute('data-court');
        tab.setAttribute('data-price', rate);
        tab.querySelector('p').innerText = `Synthetic Mat • ₹${rate}/hr`;

        // Check if court is disabled by admin
        if (cName.includes('Court 1')) {
          if (s.court1Active === false) {
            tab.classList.add('disabled-maintenance');
            tab.querySelector('p').innerText = "Under Maintenance";
            tab.style.opacity = '0.4';
            tab.style.cursor = 'not-allowed';
          } else {
            tab.classList.remove('disabled-maintenance');
            tab.style.opacity = '1';
            tab.style.cursor = 'pointer';
          }
        } else if (cName.includes('Court 2')) {
          if (s.court2Active === false) {
            tab.classList.add('disabled-maintenance');
            tab.querySelector('p').innerText = "Under Maintenance";
            tab.style.opacity = '0.4';
            tab.style.cursor = 'not-allowed';
          } else {
            tab.classList.remove('disabled-maintenance');
            tab.style.opacity = '1';
            tab.style.cursor = 'pointer';
          }
        }
      });

      // Update current selection price
      const active = courtTabs.querySelector('.court-tab.active');
      if (active && !active.classList.contains('disabled-maintenance')) {
        courtPrice = rate;
      } else {
        // Find alternative active court
        const alternative = courtTabs.querySelector('.court-tab:not(.disabled-maintenance)');
        if (alternative) {
          courtTabs.querySelectorAll('.court-tab').forEach(t => t.classList.remove('active'));
          alternative.classList.add('active');
          selectedCourt = alternative.getAttribute('data-court');
          courtPrice = rate;
        } else {
          selectedCourt = '';
          courtPrice = 0;
          showToast("All courts are undergoing maintenance today.", "error");
        }
      }
      
      updateBookingSummary();
      renderTimeSlots();
    });
  }

  // Court Selection Tabs click handler
  courtTabs.querySelectorAll('.court-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.classList.contains('disabled-maintenance')) {
        showToast("This court is currently undergoing maintenance.", "error");
        return;
      }
      courtTabs.querySelectorAll('.court-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      selectedCourt = tab.getAttribute('data-court');
      selectedSlot = ''; // Reset slot
      updateBookingSummary();
      renderTimeSlots();
    });
  });

  // Generate 7 Days Calendar Starting from Today
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  calendarDays.innerHTML = '';
  
  for (let i = 0; i < 7; i++) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + i);

    const dayName = daysOfWeek[futureDate.getDay()];
    const dateNum = futureDate.getDate();
    const fullDateStr = getLocalYYYYMMDD(futureDate);
    
    const dayBtn = document.createElement('div');
    dayBtn.className = `calendar-day ${i === 0 ? 'active' : ''}`;
    dayBtn.setAttribute('data-date', fullDateStr);
    
    if (i === 0) {
      selectedDate = fullDateStr;
    }

    dayBtn.innerHTML = `
      <span>${dayName}</span>
      <p>${dateNum}</p>
    `;

    dayBtn.addEventListener('click', () => {
      calendarDays.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('active'));
      dayBtn.classList.add('active');
      selectedDate = fullDateStr;
      selectedSlot = ''; // Reset slot
      updateBookingSummary();
      renderTimeSlots();
    });

    calendarDays.appendChild(dayBtn);
  }

  // Pre-defined Hourly slots (5 AM to 9 PM)
  const hourSlots = [
    '05:00 AM - 06:00 AM',
    '06:00 AM - 07:00 AM',
    '07:00 AM - 08:00 AM',
    '08:00 AM - 09:00 AM',
    '09:00 AM - 10:00 AM',
    '04:00 PM - 05:00 PM',
    '05:00 PM - 06:00 PM',
    '06:00 PM - 07:00 PM',
    '07:00 PM - 08:00 PM',
    '08:00 PM - 09:00 PM',
    '09:00 PM - 10:00 PM',
  ];

  // Render slots based on selected court and date, checked against Firebase Database
  function renderTimeSlots() {
    slotsGrid.innerHTML = '';
    
    if (!selectedCourt) {
      slotsGrid.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem; padding: 10px;">No courts selected.</p>';
      return;
    }

    if (!db) {
      slotsGrid.innerHTML = '<p style="color:#ef4444; font-size:0.85rem; padding: 10px;">Offline: Firebase configuration missing.</p>';
      return;
    }

    // Read bookings from Firebase
    db.ref('bookings').once('value').then((snapshot) => {
      slotsGrid.innerHTML = '';
      
      const bookingsObj = snapshot.val() || {};
      const bookedSlots = [];
      
      // Filter active slots for selected court & date (Approved status blocks booking)
      Object.keys(bookingsObj).forEach(key => {
        const b = bookingsObj[key];
        if (b.court === selectedCourt && b.date === selectedDate && b.status === 'Approved') {
          bookedSlots.push(b.slot);
        }
      });

      const now = new Date();
      const isToday = selectedDate === getLocalYYYYMMDD(now);
      const currentHour = now.getHours();

      hourSlots.forEach(slot => {
        const slotBtn = document.createElement('div');
        slotBtn.className = 'slot-pill';
        slotBtn.innerText = slot.split(' - ')[0]; // display "06:00 AM" style
        
        const isBooked = bookedSlots.includes(slot);
        const slotStartHour = getSlotStartHour24(slot);
        const isPastSlot = isToday && (slotStartHour <= currentHour);

        if (isBooked || isPastSlot) {
          slotBtn.classList.add('booked');
          if (isBooked) {
            slotBtn.innerHTML += ' <span style="font-size:0.6rem; display:block; opacity:0.8;">Booked</span>';
          } else {
            slotBtn.classList.add('disabled');
            slotBtn.innerHTML += ' <span style="font-size:0.6rem; display:block; opacity:0.8;">Unavailable</span>';
          }
        } else {
          if (selectedSlot === slot) {
            slotBtn.classList.add('active');
          }
          slotBtn.addEventListener('click', () => {
            slotsGrid.querySelectorAll('.slot-pill').forEach(s => s.classList.remove('active'));
            slotBtn.classList.add('active');
            selectedSlot = slot;
            updateBookingSummary();
          });
        }
        slotsGrid.appendChild(slotBtn);
      });
    }).catch(err => {
      console.error(err);
      slotsGrid.innerHTML = '<p style="color:#ef4444; font-size:0.85rem;">Failed to load slot schedules.</p>';
    });
  }

  // Sync state changes with summary sidebar
  function updateBookingSummary() {
    if (selectedDate) {
      const parts = selectedDate.split('-');
      const dObj = new Date(parts[0], parts[1]-1, parts[2]);
      summaryDate.innerText = dObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } else {
      summaryDate.innerText = 'Select a Date';
    }

    summaryCourt.innerText = selectedCourt || "No Court";
    
    const hasValidName = bookNameInput.value.trim().length > 0;
    const hasValidPhone = bookPhoneInput.value.trim().length >= 10;

    if (selectedSlot && selectedCourt) {
      summarySlot.innerText = selectedSlot;
      summaryTotalPrice.innerText = `₹${courtPrice}`;
      confirmBtn.disabled = !(hasValidName && hasValidPhone);
    } else {
      summarySlot.innerText = 'Select a Slot';
      summaryTotalPrice.innerText = '₹0';
      confirmBtn.disabled = true;
    }
  }

  // Listeners for inputs to dynamically enable/disable the booking confirmation button
  bookNameInput.addEventListener('input', updateBookingSummary);
  bookPhoneInput.addEventListener('input', updateBookingSummary);

  // Handle slot reservation execution
  confirmBtn.addEventListener('click', () => {
    const customerName = bookNameInput.value.trim();
    const customerPhone = bookPhoneInput.value.trim();

    if (!customerName || !customerPhone || !selectedCourt || !selectedDate || !selectedSlot) {
      showToast('Please enter your details and select a slot', 'error');
      return;
    }

    if (!db) {
      showToast('Firebase connection not available', 'error');
      return;
    }

    const newBooking = {
      name: customerName,
      phone: customerPhone,
      court: selectedCourt,
      date: selectedDate,
      slot: selectedSlot,
      price: courtPrice,
      status: 'Pending Approval',
      createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    // Save to Firebase Database
    db.ref('bookings').push(newBooking).then(() => {
      showToast(`Success! Booking registered for ${customerName}`);
      
      // WhatsApp Click-to-chat redirection
      const parts = selectedDate.split('-');
      const formattedDate = new Date(parts[0], parts[1]-1, parts[2]).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      
      const greetingMsg = `Hello Mavis Badminton Academy,\n\nI have just requested a court booking on your website. Here are my booking details:\n\n👤 Player Name: ${customerName}\n📞 Mobile No: ${customerPhone}\n🏟️ Court: ${selectedCourt}\n📅 Date: ${formattedDate}\n⏰ Time Slot: ${selectedSlot}\n💳 Price: ₹${courtPrice}/hour\n\nStatus: Pending Approval\n\nPlease approve my court reservation. Thank you!`;
      const encodedMsg = encodeURIComponent(greetingMsg);
      const whatsappUrl = `https://wa.me/${OWNER_PHONE}?text=${encodedMsg}`;
      
      // Show notice of redirection
      showToast('Opening WhatsApp... Please tap "Send" in WhatsApp to submit your booking!', 'success');
      
      // Redirect player to WhatsApp
      setTimeout(() => {
        window.open(whatsappUrl, '_blank');
      }, 1000);
      
      // Reset inputs & selection
      bookNameInput.value = '';
      bookPhoneInput.value = '';
      selectedSlot = '';
      
      // Refresh UI
      updateBookingSummary();
      renderTimeSlots();
    }).catch(err => {
      console.error(err);
      showToast('Failed to save reservation details. Try again.', 'error');
    });
  });

  // Run initial slot rendering
  renderTimeSlots();
  updateBookingSummary();
}

// Set batch option on batch inquire button click
window.selectBatch = function(batchName) {
  const selectElement = document.getElementById('contact-batch');
  if (selectElement) {
    selectElement.value = batchName;
    const contactSection = document.getElementById('contact');
    if (contactSection) {
      contactSection.scrollIntoView({ behavior: 'smooth' });
    }
  }
};

// --- CONTACT INQUIRIES (FIREBASE DRIVEN) ---
function initContactForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!db) {
      showToast('Firebase connection offline.', 'error');
      return;
    }

    const name = document.getElementById('contact-name').value.trim();
    const phone = document.getElementById('contact-phone').value.trim();
    const email = document.getElementById('contact-email').value.trim();
    const batch = document.getElementById('contact-batch').value;
    const message = document.getElementById('contact-message').value.trim();

    const newInquiry = {
      name,
      phone,
      email,
      batch,
      message,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    db.ref('inquiries').push(newInquiry).then(() => {
      showToast('Inquiry submitted! We will call you soon.');
      form.reset();
    }).catch(err => {
      console.error(err);
      showToast('Failed to send inquiry. Try again.', 'error');
    });
  });
}

// --- DYNAMIC REVIEWS & RATINGS (FIREBASE READ) ---
function seedReviewsIfEmpty() {
  if (!db) return;
  db.ref('seeded/reviews').once('value').then(seededSnapshot => {
    if (seededSnapshot.val()) return; // Already seeded before, don't auto-recreate if deleted

    db.ref('reviews').once('value').then(snapshot => {
      if (!snapshot.exists()) {
        const seedReviews = [
          {
            name: "Rithish Kumar",
            rating: 5,
            text: "Excellent synthetic courts and professional training facility. The booking system is extremely seamless and easy to use!",
            createdAt: firebase.database.ServerValue.TIMESTAMP
          },
          {
            name: "Sanjay R.",
            rating: 5,
            text: "Best academy in Gobichettipalayam! Coaches Vignesh and Priya are extremely supportive and experienced.",
            createdAt: firebase.database.ServerValue.TIMESTAMP
          },
          {
            name: "Vignesh K.",
            rating: 4,
            text: "Spacious layout, high-quality synthetic mats, and great anti-glare lighting. Highly recommended for daily practice.",
            createdAt: firebase.database.ServerValue.TIMESTAMP
          }
        ];
        
        let promises = seedReviews.map(r => db.ref('reviews').push(r));
        Promise.all(promises).then(() => {
          db.ref('seeded/reviews').set(true);
        });
      } else {
        db.ref('seeded/reviews').set(true);
      }
    });
  });
}

// --- DYNAMIC REVIEWS & RATINGS (FIREBASE READ) ---
function initReviewsAndRatings() {
  const reviewsList = document.getElementById('reviews-list');
  const aggregateRatingNumber = document.getElementById('aggregate-rating-number');
  const reviewsCountLabel = document.getElementById('reviews-count-label');

  if (!reviewsList) return;

  // Load reviews list in real time
  if (db) {
    seedReviewsIfEmpty();
    db.ref('reviews').on('value', (snapshot) => {
      reviewsList.innerHTML = '';
      const reviewsObj = snapshot.val() || {};
      
      const reviewKeys = Object.keys(reviewsObj);
      let totalRating = 0;
      let reviewCount = reviewKeys.length;

      if (reviewCount === 0) {
        reviewsList.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem; padding: 20px; text-align:center; grid-column: span 3;">No reviews published yet.</p>';
        if (aggregateRatingNumber) aggregateRatingNumber.innerHTML = `0.0 <span style="font-size: 1.1rem; color: var(--text-muted);">/ 5</span>`;
        if (reviewsCountLabel) reviewsCountLabel.innerText = "0 Reviews";
        return;
      }

      // Calculate aggregates for ALL reviews
      reviewKeys.forEach(key => {
        totalRating += parseInt(reviewsObj[key].rating);
      });

      // Render only the latest 3 reviews in reverse chronological order
      const latestKeys = [...reviewKeys].reverse().slice(0, 3);
      latestKeys.forEach(key => {
        const r = reviewsObj[key];

        const card = document.createElement('div');
        card.className = 'glass-card testimonial-card';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
        
        // Generate Star SVGs
        let starsSvg = '';
        for (let i = 1; i <= 5; i++) {
          starsSvg += `
            <svg style="width:14px; height:14px; fill:${i <= r.rating ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}" viewBox="0 0 24 24">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
            </svg>
          `;
        }

        // Relative date placeholder
        const dateString = r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Verified Guest';

        card.innerHTML = `
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
              <div class="testimonial-rating" style="margin-bottom:0;">
                ${starsSvg}
              </div>
              <span style="font-size: 0.75rem; color: var(--text-muted);">${dateString}</span>
            </div>
            <p class="testimonial-quote">"${r.text}"</p>
          </div>
          <div class="testimonial-author" style="margin-top: auto; padding-top: 16px;">
            <div class="testimonial-avatar">${r.name.charAt(0).toUpperCase()}</div>
            <div>
              <h4 class="testimonial-name">${r.name}</h4>
              <p class="testimonial-role">Verified Player</p>
            </div>
          </div>
        `;
        reviewsList.appendChild(card);
      });

      // Calculate aggregates
      const avgRating = (totalRating / reviewCount).toFixed(1);
      if (aggregateRatingNumber) {
        aggregateRatingNumber.innerHTML = `${avgRating} <span style="font-size: 1.1rem; color: var(--text-muted);">/ 5</span>`;
      }
      if (reviewsCountLabel) {
        reviewsCountLabel.innerText = `${reviewCount} Google Review${reviewCount > 1 ? 's' : ''}`;
      }
    });
  }
}



// --- MICRO-INTERACTIONS & SCROLL ANIMATIONS ---
function initScrollAnimations() {
  const cards = document.querySelectorAll('.glass-card, .coaching-card, .facility-card, .testimonial-card');
  
  const observerOptions = {
    threshold: 0.05,
    rootMargin: '0px 0px -30px 0px'
  };

  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  cards.forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
    observer.observe(card);
  });
}
