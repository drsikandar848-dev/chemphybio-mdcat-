
import { auth, db } from "./firebase-config.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

/* =====================================================
   CHEMPHYBIO MDCAT — MAIN SCRIPT
   Replace the ADMIN_UID placeholder with your own UID.
===================================================== */

const ADMIN_UID = "PASTE_YOUR_ADMIN_UID_HER";

const QUESTIONS_COLLECTION = "questions";
const CONTENT_COLLECTION = "siteContent";
const CONTRIBUTORS_COLLECTION = "contributors";

const $ = (id) => document.getElementById(id);

let currentUser = null;
let isAdmin = false;
let allQuestions = [];
let currentQuiz = [];
let currentQuestionIndex = 0;
let selectedAnswers = [];
let testTimer = null;
let secondsRemaining = 0;
let editingQuestionId = null;

/* =====================================================
   SAMPLE QUESTIONS — USED WHEN FIRESTORE HAS NO DATA
===================================================== */

const sampleQuestions = [
  {
    subject: "Biology",
    chapter: "Cell Biology",
    question: "Which organelle is known as the powerhouse of the cell?",
    options: ["Nucleus", "Ribosome", "Mitochondrion", "Golgi body"],
    answer: 2,
    explanation: "Mitochondria produce most of the ATP used by the cell."
  },
  {
    subject: "Biology",
    chapter: "Cell Biology",
    question: "What is the basic structural and functional unit of life?",
    options: ["Tissue", "Cell", "Organ", "Organ system"],
    answer: 1,
    explanation: "The cell is the basic structural and functional unit of life."
  },
  {
    subject: "Biology",
    chapter: "Genetics",
    question: "Which molecule carries hereditary information?",
    options: ["Protein", "Lipid", "DNA", "Glucose"],
    answer: 2,
    explanation: "DNA stores hereditary information in most organisms."
  },
  {
    subject: "Chemistry",
    chapter: "Periodic Table",
    question: "What is the chemical symbol of sodium?",
    options: ["S", "So", "Na", "N"],
    answer: 2,
    explanation: "The chemical symbol of sodium is Na."
  },
  {
    subject: "Physics",
    chapter: "Motion",
    question: "What is the SI unit of force?",
    options: ["Joule", "Newton", "Watt", "Pascal"],
    answer: 1,
    explanation: "Force is measured in newtons."
  },
  {
    subject: "English",
    chapter: "Vocabulary",
    question: "Choose the synonym of 'Rapid'.",
    options: ["Slow", "Quick", "Weak", "Late"],
    answer: 1,
    explanation: "Rapid means fast or quick."
  },
  {
    subject: "Logical Reasoning",
    chapter: "Patterns",
    question: "What comes next: 2, 4, 6, 8, ...?",
    options: ["9", "10", "11", "12"],
    answer: 1,
    explanation: "The sequence increases by 2."
  }
];

/* =====================================================
   GENERAL HELPERS
===================================================== */

function showMessage(id, message, type = "info") {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.dataset.type = type;
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

function normalizeQuestion(data, id = null) {
  return {
    id,
    subject: data.subject || "Biology",
    chapter: data.chapter || "General",
    question: data.question || "",
    options: Array.isArray(data.options) ? data.options : [],
    answer: Number(data.answer),
    explanation: data.explanation || ""
  };
}

/* =====================================================
   LANGUAGE SWITCH
===================================================== */

const translations = {
  en: {
    welcome: "Welcome to CHEMPHYBIO MDCAT",
    start: "Start Quiz",
    next: "Next Question",
    submit: "Submit Test",
    correct: "Correct",
    incorrect: "Incorrect",
    noQuestions: "No questions available."
  },
  ur: {
    welcome: "CHEMPHYBIO MDCAT میں خوش آمدید",
    start: "کوئز شروع کریں",
    next: "اگلا سوال",
    submit: "ٹیسٹ جمع کریں",
    correct: "درست",
    incorrect: "غلط",
    noQuestions: "فی الحال کوئی سوال موجود نہیں۔"
  }
};

let currentLanguage = localStorage.getItem("chempyLanguage") || "en";

function applyLanguage() {
  document.documentElement.lang = currentLanguage;

  document.querySelectorAll("[data-en][data-ur]").forEach(element => {
    element.textContent =
      element.dataset[currentLanguage] || element.dataset.en;
  });

  document.body.classList.toggle("urdu-mode", currentLanguage === "ur");
}

function setupLanguage() {
  const button = $("languageToggle");
  if (!button) return;

  button.addEventListener("click", () => {
    currentLanguage = currentLanguage === "en" ? "ur" : "en";
    localStorage.setItem("chempyLanguage", currentLanguage);
    applyLanguage();
  });

  applyLanguage();
}

/* =====================================================
   LOAD QUESTIONS FROM FIRESTORE
===================================================== */

async function loadQuestions() {
  try {
    const snapshot = await getDocs(collection(db, QUESTIONS_COLLECTION));

    const firebaseQuestions = snapshot.docs.map(item =>
      normalizeQuestion(item.data(), item.id)
    );

    allQuestions = [...sampleQuestions];

    firebaseQuestions.forEach(question => {
      const existingIndex = allQuestions.findIndex(item =>
        item.question === question.question
      );

      if (existingIndex >= 0) {
        allQuestions[existingIndex] = question;
      } else {
        allQuestions.push(question);
      }
    });

    renderQuestionLists();
    return allQuestions;
  } catch (error) {
    console.error("Question loading error:", error);
    allQuestions = [...sampleQuestions];
    renderQuestionLists();
    return allQuestions;
  }
}

function renderQuestionLists() {
  const list = $("adminMcqList");
  if (!list) return;

  const firebaseOnly = allQuestions.filter(question => question.id);

  if (!firebaseOnly.length) {
    list.textContent = "No saved Firebase questions yet.";
    return;
  }

  list.innerHTML = firebaseOnly.map(question => `
    <div class="admin-question-item">
      <strong>${escapeHTML(question.subject)}</strong>
      <small>${escapeHTML(question.chapter)}</small>
      <p>${escapeHTML(question.question)}</p>
      <button type="button" data-edit="${escapeHTML(question.id)}">Edit</button>
      <button type="button" data-delete="${escapeHTML(question.id)}">Delete</button>
    </div>
  `).join("");

  list.querySelectorAll("[data-edit]").forEach(button => {
    button.addEventListener("click", () => {
      editQuestion(button.dataset.edit);
    });
  });

  list.querySelectorAll("[data-delete]").forEach(button => {
    button.addEventListener("click", () => {
      removeQuestion(button.dataset.delete);
    });
  });
}

/* =====================================================
   QUICK QUIZ
===================================================== */

function startQuickQuiz(subject = "All") {
  const available = subject === "All"
    ? allQuestions
    : allQuestions.filter(q => q.subject === subject);

  if (!available.length) {
    alert(translations[currentLanguage].noQuestions);
    return;
  }

  currentQuiz = shuffle(available).slice(0, Math.min(10, available.length));
  currentQuestionIndex = 0;
  selectedAnswers = [];

  const area = $("quizArea");
  if (area) area.hidden = false;

  renderQuizQuestion();
}

function renderQuizQuestion() {
  const area = $("quizArea");
  if (!area) return;

  const question = currentQuiz[currentQuestionIndex];
  if (!question) return;

  area.innerHTML = `
    <div class="quiz-question">
      <p>Question ${currentQuestionIndex + 1} of ${currentQuiz.length}</p>
      <h3>${escapeHTML(question.question)}</h3>

      <div class="quiz-options">
        ${question.options.map((option, index) => `
          <label>
            <input type="radio" name="quizAnswer" value="${index}">
            ${escapeHTML(option)}
          </label>
        `).join("")}
      </div>

      <button type="button" id="quizNext">
        ${currentQuestionIndex === currentQuiz.length - 1
          ? "Finish Quiz"
          : "Next Question"}
      </button>
    </div>
  `;

  area.querySelector("#quizNext").addEventListener("click", () => {
    const selected = area.querySelector('input[name="quizAnswer"]:checked');

    if (!selected) {
      alert("Please select an answer.");
      return;
    }

    selectedAnswers[currentQuestionIndex] = Number(selected.value);

    if (currentQuestionIndex < currentQuiz.length - 1) {
      currentQuestionIndex++;
      renderQuizQuestion();
    } else {
      showQuizResult();
    }
  });
}

function showQuizResult() {
  const correct = currentQuiz.reduce((total, question, index) => {
    return total + (
      selectedAnswers[index] === question.answer ? 1 : 0
    );
  }, 0);

  const area = $("quizArea");
  if (!area) return;

  area.innerHTML = `
    <div class="quiz-result">
      <h2>Quiz Completed!</h2>
      <h3>${correct} / ${currentQuiz.length}</h3>
      <p>Your score: ${Math.round(correct / currentQuiz.length * 100)}%</p>
      <button type="button" id="restartQuiz">Try Again</button>
    </div>
  `;

  $("restartQuiz").addEventListener("click", () => startQuickQuiz());
}

/* =====================================================
   FULL TEST
===================================================== */

function getFullTestQuestions(count = 100) {
  const subjects = [
    "Biology",
    "Chemistry",
    "Physics",
    "English",
    "Logical Reasoning"
  ];

  const result = [];

  subjects.forEach(subject => {
    const subjectQuestions = shuffle(
      allQuestions.filter(q => q.subject === subject)
    );

    result.push(...subjectQuestions);
  });

  return shuffle(result).slice(0, Math.min(count, result.length));
}

function startFullTest() {
  const countInput = $("testQuestionCount");
  const count = countInput ? Number(countInput.value) : 100;

  currentQuiz = getFullTestQuestions(count);

  if (!currentQuiz.length) {
    alert("No questions available for this test.");
    return;
  }

  currentQuestionIndex = 0;
  selectedAnswers = [];

  renderQuizQuestion();
}

function submitFullTest() {
  showQuizResult();
  if (testTimer) clearInterval(testTimer);
}

/* =====================================================
   ADMIN LOGIN
===================================================== */

function setupAdminLogin() {
  const form = $("adminLoginForm");
  if (!form) return;

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const email = $("adminEmail")?.value.trim();
    const password = $("adminPassword")?.value;

    if (!email || !password) {
      showMessage("adminMessage", "Enter email and password.", "error");
      return;
    }

    if (!ADMIN_UID || ADMIN_UID === "PASTE_YOUR_ADMIN_UID_HERE") {
      showMessage("adminMessage", "Admin UID has not been configured.", "error");
      return;
    }

    try {
      showMessage("adminMessage", "Signing in...");

      const result = await signInWithEmailAndPassword(auth, email, password);

      if (result.user.uid !== ADMIN_UID) {
        await signOut(auth);
        showMessage("adminMessage", "This account is not the authorized admin.", "error");
        return;
      }

      showMessage("adminMessage", "Login successful!", "success");
    } catch (error) {
      console.error(error);
      showMessage("adminMessage", authErrorMessage(error.code), "error");
    }
  });
}

function authErrorMessage(code) {
  const messages = {
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-email": "Please enter a valid email.",
    "auth/too-many-requests": "Too many attempts. Please try later.",
    "auth/network-request-failed": "Check your internet connection."
  };

  return messages[code] || `Login failed: ${code || "Unknown error"}`;
}

function setupAuthListener() {
  onAuthStateChanged(auth, async user => {
    currentUser = user;
    isAdmin = Boolean(user && user.uid === ADMIN_UID);

    const loginForm = $("adminLoginForm");
    const dashboard = $("adminDashboard");

    if (isAdmin) {
      if (loginForm) loginForm.hidden = true;
      if (dashboard) dashboard.hidden = false;
      await loadAdminContent();
    } else {
      if (loginForm) loginForm.hidden = false;
      if (dashboard) dashboard.hidden = true;
    }
  });
}

/* =====================================================
   ADMIN MCQ ADD / EDIT / DELETE
===================================================== */

function setupMCQForm() {
  const form = $("mcqForm");
  if (!form) return;

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (!isAdmin) {
      showMessage("adminStatus", "Admin access required.", "error");
      return;
    }

    const subject = $("mcqSubject")?.value;
    const question = $("mcqQuestion")?.value.trim();

    const options = [0, 1, 2, 3].map(index =>
      $(`mcqOption${index}`)?.value.trim() || ""
    );

    const answer = Number($("mcqAnswer")?.value);
    const explanation = $("mcqExplanation")?.value.trim() || "";

    if (!subject || !question || options.some(option => !option)) {
      showMessage("adminStatus", "Complete all question fields.", "error");
      return;
    }

    if (!Number.isInteger(answer) || answer < 0 || answer > 3) {
      showMessage("adminStatus", "Select a valid correct answer.", "error");
      return;
    }

    const chapter = $("mcqChapter")?.value.trim() || "General";

    const questionData = {
      subject,
      chapter,
      question,
      options,
      answer,
      explanation,
      updatedAt: serverTimestamp()
    };

    try {
      if (editingQuestionId) {
        await updateDoc(
          doc(db, QUESTIONS_COLLECTION, editingQuestionId),
          questionData
        );
        editingQuestionId = null;
      } else {
        questionData.createdAt = serverTimestamp();
        await addDoc(collection(db, QUESTIONS_COLLECTION), questionData);
      }

      form.reset();
      showMessage("adminStatus", "Question saved successfully!", "success");
      await loadQuestions();
    } catch (error) {
      console.error(error);
      showMessage("adminStatus", `Save failed: ${error.message}`, "error");
    }
  });
}

async function editQuestion(id) {
  if (!isAdmin) return;

  const question = allQuestions.find(item => item.id === id);
  if (!question) return;

  editingQuestionId = id;

  if ($("mcqSubject")) $("mcqSubject").value = question.subject;
  if ($("mcqQuestion")) $("mcqQuestion").value = question.question;
  if ($("mcqAnswer")) $("mcqAnswer").value = String(question.answer);
  if ($("mcqExplanation")) $("mcqExplanation").value = question.explanation;
  if ($("mcqChapter")) $("mcqChapter").value = question.chapter;

  question.options.forEach((option, index) => {
    const input = $(`mcqOption${index}`);
    if (input) input.value = option;
  });

  $("mcqForm")?.scrollIntoView({ behavior: "smooth" });
}

async function removeQuestion(id) {
  if (!isAdmin) return;

  if (!confirm("Are you sure you want to delete this question?")) return;

  try {
    await deleteDoc(doc(db, QUESTIONS_COLLECTION, id));
    showMessage("adminStatus", "Question deleted.", "success");
    await loadQuestions();
  } catch (error) {
    console.error(error);
    showMessage("adminStatus", `Delete failed: ${error.message}`, "error");
  }
}

/* =====================================================
   ADMIN CONTENT: PROFILE, POSTERS, ADS, WHATSAPP
   Images must be hosted on GitHub or another public
   image host because Firebase Storage is not enabled.
===================================================== */

function createAdminExtraTools() {
  if (!isAdmin || $("adminExtraTools")) return;

  const dashboard = $("adminDashboard");
  if (!dashboard) return;

  const section = document.createElement("section");
  section.id = "adminExtraTools";
  section.className = "admin-extra-tools";

  section.innerHTML = `
    <hr>
    <h2>Website Content Manager</h2>

    <form id="siteContentForm">
      <label>Admin name</label>
      <input id="siteAdminName" type="text" placeholder="Admin name">

      <label>Admin photo URL</label>
      <input id="siteAdminPhoto" type="url" placeholder="https://...">

      <label>Welcome message</label>
      <textarea id="siteWelcome"></textarea>

      <label>WhatsApp community URL</label>
      <input id="siteWhatsApp" type="url" placeholder="https://chat.whatsapp.com/...">

      <label>Poster image URL</label>
      <input id="sitePoster" type="url" placeholder="https://...">

      <label>Advertisement image URL</label>
      <input id="siteAd" type="url" placeholder="https://...">

      <button type="submit">Save Website Content</button>
    </form>

    <hr>
    <h3>Contributor Access List</h3>
    <form id="contributorForm">
      <input id="contributorEmail" type="email" placeholder="Contributor email" required>
      <button type="submit">Authorize Contributor Email</button>
    </form>
    <div id="contributorList"></div>

    <button type="button" id="adminLogout">Logout</button>
  `;

  dashboard.appendChild(section);

  $("siteContentForm").addEventListener("submit", saveSiteContent);
  $("contributorForm").addEventListener("submit", addContributor);

  $("adminLogout").addEventListener("click", async () => {
    await signOut(auth);
  });
}

async function loadAdminContent() {
  createAdminExtraTools();

  try {
    const contentRef = doc(db, CONTENT_COLLECTION, "main");
    const snapshot = await getDoc(contentRef);

    if (snapshot.exists()) {
      const data = snapshot.data();

      if ($("siteAdminName")) $("siteAdminName").value = data.adminName || "";
      if ($("siteAdminPhoto")) $("siteAdminPhoto").value = data.adminPhoto || "";
      if ($("siteWelcome")) $("siteWelcome").value = data.welcome || "";
      if ($("siteWhatsApp")) $("siteWhatsApp").value = data.whatsapp || "";
      if ($("sitePoster")) $("sitePoster").value = data.poster || "";
      if ($("siteAd")) $("siteAd").value = data.ad || "";

      renderPublicContent(data);
    }

    await loadContributors();
  } catch (error) {
    console.error("Content loading error:", error);
  }
}

async function saveSiteContent(event) {
  event.preventDefault();
  if (!isAdmin) return;

  const data = {
    adminName: $("siteAdminName").value.trim(),
    adminPhoto: $("siteAdminPhoto").value.trim(),
    welcome: $("siteWelcome").value.trim(),
    whatsapp: $("siteWhatsApp").value.trim(),
    poster: $("sitePoster").value.trim(),
    ad: $("siteAd").value.trim(),
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(doc(db, CONTENT_COLLECTION, "main"), data, { merge: true });
    renderPublicContent(data);
    alert("Website content saved.");
  } catch (error) {
    console.error(error);
    alert("Could not save content: " + error.message);
  }
}

function renderPublicContent(data) {
  const welcome = $("welcomeMessage");
  if (welcome) welcome.textContent = data.welcome || "";

  const name = $("adminPublicName");
  if (name) name.textContent = data.adminName || "";

  const photo = $("adminPublicPhoto");
  if (photo && data.adminPhoto) photo.src = data.adminPhoto;

  const whatsapp = $("whatsappCommunity");
  if (whatsapp) {
    whatsapp.href = data.whatsapp || "#";
    whatsapp.hidden = !data.whatsapp;
  }

  const poster = $("posterImage");
  if (poster && data.poster) poster.src = data.poster;

  const ad = $("advertisementImage");
  if (ad && data.ad) ad.src = data.ad;
}

/* =====================================================
   CONTRIBUTORS
   This authorizes an email in Firestore. It does NOT
   create a Firebase Authentication account or send an
   invitation email. Security rules must enforce roles.
===================================================== */

async function addContributor(event) {
  event.preventDefault();
  if (!isAdmin) return;

  const email = $("contributorEmail").value.trim().toLowerCase();
  if (!email) return;

  try {
    await setDoc(doc(db, CONTRIBUTORS_COLLECTION, email), {
      email,
      role: "contributor",
      active: true,
      addedAt: serverTimestamp()
    });

    $("contributorEmail").value = "";
    await loadContributors();
    alert("Contributor email authorized.");
  } catch (error) {
    console.error(error);
    alert("Could not authorize contributor: " + error.message);
  }
}

async function loadContributors() {
  if (!isAdmin) return;

  const container = $("contributorList");
  if (!container) return;

  try {
    const snapshot = await getDocs(collection(db, CONTRIBUTORS_COLLECTION));

    container.innerHTML = snapshot.docs.map(item => `
      <div>
        ${escapeHTML(item.data().email || item.id)}
        <button type="button" data-remove-contributor="${escapeHTML(item.id)}">
          Remove
        </button>
      </div>
    `).join("");

    container.querySelectorAll("[data-remove-contributor]").forEach(button => {
      button.addEventListener("click", async () => {
        if (!confirm("Remove this contributor?")) return;

        await deleteDoc(
          doc(db, CONTRIBUTORS_COLLECTION, button.dataset.removeContributor)
        );

        await loadContributors();
      });
    });
  } catch (error) {
    console.error(error);
  }
}

/* =====================================================
   MDCAT AGGREGATE CALCULATOR
   Default weights are editable below. Confirm the
   official formula for the relevant admission year.
===================================================== */

function setupAggregateCalculator() {
  const button = $("calculateAggregate");
  if (!button) return;

  button.addEventListener("click", () => {
    const matric = Number($("matricMarks")?.value);
    const fsc = Number($("fscMarks")?.value);
    const mdcat = Number($("mdcatMarks")?.value);

    const matricTotal = Number($("matricTotal")?.value);
    const fscTotal = Number($("fscTotal")?.value);
    const mdcatTotal = Number($("mdcatTotal")?.value);

    if (
      !matricTotal || !fscTotal || !mdcatTotal ||
      matric < 0 || matric > matricTotal ||
      fsc < 0 || fsc > fscTotal ||
      mdcat < 0 || mdcat > mdcatTotal
    ) {
      alert("Please enter valid marks and total marks.");
      return;
    }

    // Example weights only — update according to official policy.
    const aggregate =
      (matric / matricTotal * 100 * 0.10) +
      (fsc / fscTotal * 100 * 0.40) +
      (mdcat / mdcatTotal * 100 * 0.50);

    const result = $("aggregateResult");
    if (result) {
      result.textContent = `Aggregate: ${aggregate.toFixed(2)}%`;
    }
  });
}

/* =====================================================
   FULL TEST BUTTONS AND SUBJECT SELECTOR
===================================================== */

function setupQuizButtons() {
  document.querySelectorAll("[data-subject]").forEach(button => {
    button.addEventListener("click", () => {
      startQuickQuiz(button.dataset.subject);
    });
  });

  const startButton = $("startFullTest");
  if (startButton) {
    startButton.addEventListener("click", startFullTest);
  }

  const subjectSelect = $("subjectSelect");
  if (subjectSelect) {
    subjectSelect.addEventListener("change", () => {
      startQuickQuiz(subjectSelect.value || "All");
    });
  }
}

/* =====================================================
   MOBILE MENU
===================================================== */

function setupMobileMenu() {
  const button = $("menuToggle");
  const menu = $("navLinks");

  if (!button || !menu) return;

  button.addEventListener("click", () => {
    menu.classList.toggle("active");
  });
}

/* =====================================================
   START WEBSITE
===================================================== */

async function initializeWebsite() {
  setupLanguage();
  setupAdminLogin();
  setupMCQForm();
  setupQuizButtons();
  setupAggregateCalculator();
  setupMobileMenu();

  await loadQuestions();

  setupAuthListener();

  console.log("CHEMPHYBIO MDCAT initialized.");
}

initializeWebsite().catch(error => {
  console.error("Website initialization failed:", error);
});
