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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

/* =========================================
   ADMIN UID
   Apna pehle wala admin UID yahan rakhein.
========================================= */

const ADMIN_UID = "PASTE_YOUR_EXISTING_ADMIN_UID_HERE";

/* =========================================
   COLLECTIONS
========================================= */

const QUESTIONS_COLLECTION = "questions";
const CONTENT_COLLECTION = "siteContent";
const CONTRIBUTORS_COLLECTION = "contributors";

/* =========================================
   APP STATE
========================================= */

let allQuestions = [];
let currentQuiz = [];
let currentQuestionIndex = 0;
let currentScore = 0;
let selectedSubject = "";
let editingQuestionId = null;
let currentUser = null;
let siteContent = {};
let questionsLoaded = false;
let questionsLoading = false;
let questionLoadError = null;

let currentLanguage =
  localStorage.getItem("chempyLanguage") || "en";

/* =========================================
   HELPERS
========================================= */

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function showMessage(element, message, type = "info") {
  if (!element) return;

  element.textContent = message;

  element.style.color =
    type === "success" ? "#42c99a" :
    type === "error" ? "#ff7272" :
    "#9aacc1";
}

function shuffle(array) {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function normalizeSubject(subject = "") {
  const value = String(subject).toLowerCase().trim();

  const subjects = {
    biology: "Biology",
    bio: "Biology",
    chemistry: "Chemistry",
    chem: "Chemistry",
    physics: "Physics",
    phy: "Physics",
    english: "English",
    "logical reasoning": "Logical Reasoning",
    logic: "Logical Reasoning"
  };

  return subjects[value] || String(subject).trim();
}

/* =========================================
   LANGUAGE SYSTEM
========================================= */

const translations = {
  en: {
    noQuestions: "No questions are available for this subject yet.",
    question: "Question",
    next: "Next",
    finish: "Finish",
    retry: "Try Again",
    correct: "Correct",
    incorrect: "Incorrect",
    yourScore: "Your Score",
    loginError: "Login failed. Please check your details.",
    adminOnly: "This account is not authorized as an administrator.",
    saved: "Saved successfully.",
    deleted: "Deleted successfully.",
    error: "Something went wrong. Please try again.",
    calculatorNote: "This calculator uses example weights. Confirm the official admission formula before relying on the result."
  },

  ur: {
    noQuestions: "اس مضمون کے لیے ابھی سوالات موجود نہیں ہیں۔",
    question: "سوال",
    next: "اگلا",
    finish: "مکمل کریں",
    retry: "دوبارہ کوشش کریں",
    correct: "درست",
    incorrect: "غلط",
    yourScore: "آپ کا اسکور",
    loginError: "لاگ اِن نہیں ہو سکا۔ اپنی معلومات چیک کریں۔",
    adminOnly: "یہ اکاؤنٹ ایڈمن کے طور پر مجاز نہیں ہے۔",
    saved: "کامیابی سے محفوظ ہوگیا۔",
    deleted: "کامیابی سے حذف ہوگیا۔",
    error: "کوئی مسئلہ پیش آیا۔ دوبارہ کوشش کریں۔",
    calculatorNote: "یہ کیلکولیٹر مثال کے وزن استعمال کرتا ہے۔ سرکاری داخلہ فارمولا ضرور چیک کریں۔"
  }
};

function t(key) {
  return translations[currentLanguage]?.[key] ||
    translations.en[key] ||
    key;
}

function applyLanguage() {
  document.documentElement.lang = currentLanguage;

  document.body.classList.toggle(
    "lang-ur",
    currentLanguage === "ur"
  );

  const languageButton = $("#languageToggle");

  if (languageButton) {
    languageButton.textContent =
      currentLanguage === "en" ? "اردو" : "English";
  }

  localStorage.setItem("chempyLanguage", currentLanguage);
}

function setupLanguage() {
  $("#languageToggle")?.addEventListener("click", () => {
    currentLanguage =
      currentLanguage === "en" ? "ur" : "en";

    applyLanguage();
  });

  applyLanguage();
}

/* =========================================
   FIRESTORE QUESTION BANK
========================================= */

async function loadQuestions() {
  if (questionsLoading) return;

  questionsLoading = true;
  questionLoadError = null;

  try {
    const snapshot = await getDocs(
      collection(db, QUESTIONS_COLLECTION)
    );

    allQuestions = snapshot.docs.map(item => {
      const data = item.data();

      return {
        id: item.id,
        ...data,
        subject: normalizeSubject(data.subject || "")
      };
    });

    questionsLoaded = true;

    updateSubjectCounts();
    updateQuestionStats();

    console.log("Questions loaded:", allQuestions.length);

  } catch (error) {
    console.error("Question loading error:", error);

    allQuestions = [];
    questionLoadError = error;
    questionsLoaded = true;

    updateSubjectCounts();
    updateQuestionStats();

  } finally {
    questionsLoading = false;

    // If the visitor clicked while questions were loading,
    // start the selected quiz once loading finishes.
    if (selectedSubject) {
      startQuiz(selectedSubject);
    }
  }
}

function updateSubjectCounts() {
  const subjects = [
    "Biology",
    "Chemistry",
    "Physics",
    "English",
    "Logical Reasoning"
  ];

  subjects.forEach(subject => {
    const count = allQuestions.filter(
      question =>
        normalizeSubject(question.subject) === subject
    ).length;

    const counter = document.querySelector(
      `[data-count-for="${subject}"]`
    );

    if (counter) {
      counter.textContent = `${count} MCQs`;
    }
  });
}

function updateQuestionStats() {
  const totalElement = $("#totalMcqs");

  if (totalElement) {
    totalElement.textContent = allQuestions.length;
  }

  const subjectElement = $("#totalSubjects");

  if (subjectElement) {
    subjectElement.textContent = new Set(
      allQuestions.map(question => question.subject)
    ).size;
  }
}

/* =========================================
   QUIZ SYSTEM
========================================= */

function startQuiz(subject, limit = 10) {
  selectedSubject = subject || "All";

  const area = $("#quizArea");

  if (!area) {
    console.error("Quiz area not found in HTML.");
    return;
  }

  // IMPORTANT: Show the quiz area before displaying anything.
  area.hidden = false;
  area.style.display = "block";

  if (!questionsLoaded) {
    area.textContent = "Loading questions...";

    if (!questionsLoading) {
      loadQuestions();
    }

    return;
  }

  if (questionLoadError) {
    area.textContent =
      "Questions could not be loaded from Firebase. Please check your Firebase connection and Firestore rules.";

    return;
  }

  const available = allQuestions.filter(question => {
    return selectedSubject === "All" ||
      normalizeSubject(question.subject) ===
      normalizeSubject(selectedSubject);
  });

  if (!available.length) {
    area.textContent = t("noQuestions");
    return;
  }

  currentQuiz = shuffle(available).slice(
    0,
    Math.min(limit, available.length)
  );

  currentQuestionIndex = 0;
  currentScore = 0;

  renderQuizQuestion();
}

function renderQuizQuestion() {
  const area = $("#quizArea");

  if (!area) return;

  area.hidden = false;

  const question = currentQuiz[currentQuestionIndex];

  if (!question) {
    renderQuizResult();
    return;
  }

  const options = Array.isArray(question.options)
    ? question.options
    : [];

  area.innerHTML = `
    <div class="quiz-question">

      <p class="section-kicker">
        ${escapeHTML(question.subject || "")}
      </p>

      <p>
        ${t("question")}
        ${currentQuestionIndex + 1}
        / ${currentQuiz.length}
      </p>

      <h4>${escapeHTML(question.question || "")}</h4>

      <div class="quiz-options">
        ${options.map((option, index) => `
          <button
            class="quiz-option"
            type="button"
            data-option="${index}">
            ${escapeHTML(option)}
          </button>
        `).join("")}
      </div>

      <p class="quiz-feedback" id="quizFeedback"></p>

      <button
        class="btn"
        id="nextQuestion"
        type="button"
        hidden>
        ${currentQuestionIndex === currentQuiz.length - 1
          ? t("finish")
          : t("next")}
      </button>

    </div>
  `;

  $$(".quiz-option").forEach(button => {
    button.addEventListener("click", () => {
      answerQuestion(Number(button.dataset.option));
    });
  });

  $("#nextQuestion")?.addEventListener("click", () => {
    currentQuestionIndex++;

    if (currentQuestionIndex >= currentQuiz.length) {
      renderQuizResult();
    } else {
      renderQuizQuestion();
    }
  });
}

function answerQuestion(selectedAnswer) {
  const question = currentQuiz[currentQuestionIndex];

  if (!question) return;

  const buttons = $$(".quiz-option");

  buttons.forEach(button => {
    button.disabled = true;

    const optionIndex = Number(button.dataset.option);

    if (optionIndex === Number(question.answer)) {
      button.classList.add("correct");
    }

    if (
      optionIndex === selectedAnswer &&
      selectedAnswer !== Number(question.answer)
    ) {
      button.classList.add("incorrect");
    }
  });

  const isCorrect =
    selectedAnswer === Number(question.answer);

  if (isCorrect) {
    currentScore++;
  }

  const feedback = $("#quizFeedback");

  if (feedback) {
    feedback.textContent = isCorrect
      ? `${t("correct")}!`
      : `${t("incorrect")}. ${question.explanation || ""}`;
  }

  const nextButton = $("#nextQuestion");

  if (nextButton) {
    nextButton.hidden = false;
  }
}

function renderQuizResult() {
  const area = $("#quizArea");

  if (!area) return;

  const percentage = currentQuiz.length
    ? Math.round(
        (currentScore / currentQuiz.length) * 100
      )
    : 0;

  area.hidden = false;

  area.innerHTML = `
    <div class="quiz-result">

      <p class="section-kicker">${t("yourScore")}</p>

      <h3>${currentScore} / ${currentQuiz.length}</h3>

      <p>${percentage}%</p>

      <button
        class="btn"
        id="retryQuiz"
        type="button">
        ${t("retry")}
      </button>

    </div>
  `;

  $("#retryQuiz")?.addEventListener("click", () => {
    startQuiz(selectedSubject || "All");
  });
}

/* =========================================
   SUBJECT CARDS + QUICK PRACTICE
========================================= */

function setupPractice() {
  $$("[data-subject]").forEach(button => {
    button.addEventListener("click", () => {
      const subject = normalizeSubject(
        button.dataset.subject
      );

      const select = $("#subjectSelect");

      if (select) {
        select.value = subject;
      }

      startQuiz(subject);

      $("#quizArea")?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    });
  });

  $("#quickQuizStart")?.addEventListener("click", () => {
    const subject = $("#subjectSelect")?.value || "All";

    if (!subject) {
      const area = $("#quizArea");

      if (area) {
        area.hidden = false;
        area.textContent = "Please select a subject first.";
      }

      return;
    }

    startQuiz(normalizeSubject(subject));

    $("#quizArea")?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  });
}

/* =========================================
   FULL MOCK TEST
========================================= */

function setupMockTest() {
  $("#startFullTest")?.addEventListener("click", () => {
    const requested = Number(
      $("#testQuestionCount")?.value || 50
    );

    startQuiz("All", requested);

    $("#quizArea")?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  });
}

/* =========================================
   AGGREGATE CALCULATOR
========================================= */

function setupCalculator() {
  $("#calculateAggregate")?.addEventListener("click", () => {
    const matric = Number($("#matricMarks")?.value);
    const fsc = Number($("#fscMarks")?.value);
    const mdcat = Number($("#mdcatMarks")?.value);

    const matricTotal = Number(
      $("#matricTotal")?.value || 1100
    );

    const fscTotal = Number(
      $("#fscTotal")?.value || 1200
    );

    const mdcatTotal = Number(
      $("#mdcatTotal")?.value || 180
    );

    // HTML uses aggregateResult, not calculatorResult.
    const result = $("#aggregateResult");

    if (
      !result ||
      !matricTotal ||
      !fscTotal ||
      !mdcatTotal ||
      matric < 0 ||
      fsc < 0 ||
      mdcat < 0 ||
      matric > matricTotal ||
      fsc > fscTotal ||
      mdcat > mdcatTotal
    ) {
      if (result) {
        result.textContent = "Please enter valid marks.";
      }

      return;
    }

    // Example weighting only. Check the official formula.
    const aggregate =
      (matric / matricTotal) * 10 +
      (fsc / fscTotal) * 40 +
      (mdcat / mdcatTotal) * 50;

    result.innerHTML = `
      <div class="result-panel">
        <p>${t("yourScore")}</p>
        <strong>${aggregate.toFixed(2)}%</strong>
        <small>${t("calculatorNote")}</small>
      </div>
    `;
  });
}

/* =========================================
   PUBLIC WEBSITE CONTENT
========================================= */

async function loadPublicContent() {
  try {
    const contentRef = doc(
      db,
      CONTENT_COLLECTION,
      "main"
    );

    const snapshot = await getDoc(contentRef);

    if (!snapshot.exists()) return;

    siteContent = snapshot.data();

    const publicName = $("#adminPublicName");
    const publicPhoto = $("#adminPublicPhoto");
    const whatsapp = $("#whatsappCommunity");

    if (publicName && siteContent.adminName) {
      publicName.textContent = siteContent.adminName;
    }

    if (publicPhoto && siteContent.adminPhoto) {
      publicPhoto.src = siteContent.adminPhoto;
      publicPhoto.hidden = false;
    }

    if (whatsapp && siteContent.whatsapp) {
      whatsapp.href = siteContent.whatsapp;
      whatsapp.target = "_blank";
      whatsapp.rel = "noopener noreferrer";
      whatsapp.hidden = false;
    }

    if (siteContent.welcomeMessage) {
      const welcome =
        $("#heroWelcome") || $("#welcomeMessage");

      if (welcome) {
        welcome.textContent = siteContent.welcomeMessage;
      }
    }

    const posterCard = $("#posterCard");
    const posterImage = $("#posterImage");

    if (posterImage && siteContent.poster) {
      posterImage.src = siteContent.poster;

      if (posterCard) {
        posterCard.hidden = false;
      }
    }

    const adCard = $("#advertisementCard");
    const adImage = $("#advertisementImage");

    if (adImage && siteContent.advertisement) {
      adImage.src = siteContent.advertisement;

      if (adCard) {
        adCard.hidden = false;
      }
    }

    renderUpdates(siteContent.updates);

  } catch (error) {
    console.error("Public content error:", error);
  }
}

function renderUpdates(updates) {
  const container = $("#updatesList");

  if (!container) return;

  if (!Array.isArray(updates) || !updates.length) {
    return;
  }

  container.innerHTML = updates.map(update => `
    <article class="update-card">

      <h3>${escapeHTML(update.title || "")}</h3>

      <p>
        ${escapeHTML(
          update.description || update.text || ""
        )}
      </p>

      ${update.url ? `
        <a
          href="${escapeHTML(update.url)}"
          target="_blank"
          rel="noopener noreferrer">
          Read more
        </a>
      ` : ""}

    </article>
  `).join("");
}

/* =========================================
   ADMIN AUTHENTICATION
========================================= */

function setAdminVisibility(isAdmin) {
  const loginForm = $("#adminLoginForm");
  const dashboard = $("#adminDashboard");

  if (loginForm) {
    loginForm.hidden = isAdmin;
  }

  if (dashboard) {
    dashboard.hidden = !isAdmin;
  }
}

function setupAdminLogin() {
  $("#adminLoginForm")?.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      const email = $("#adminEmail")?.value.trim();
      const password = $("#adminPassword")?.value;
      const message = $("#adminMessage");

      if (!email || !password) {
        showMessage(
          message,
          "Enter your email and password.",
          "error"
        );

        return;
      }

      try {
        await signInWithEmailAndPassword(
          auth,
          email,
          password
        );

        showMessage(
          message,
          "Login successful.",
          "success"
        );

      } catch (error) {
        console.error("Login error:", error);

        showMessage(
          message,
          t("loginError"),
          "error"
        );
      }
    }
  );

  $("#adminLogout")?.addEventListener(
    "click",
    async () => {
      try {
        await signOut(auth);

        showMessage(
          $("#adminMessage"),
          "Logged out.",
          "success"
        );

      } catch (error) {
        console.error(error);
      }
    }
  );

  onAuthStateChanged(auth, async user => {
    currentUser = user;

    const isAdmin = Boolean(
      user &&
      ADMIN_UID !== "PASTE_YOUR_EXISTING_ADMIN_UID_HERE" &&
      user.uid === ADMIN_UID
    );

    setAdminVisibility(isAdmin);

    if (user && !isAdmin) {
      await signOut(auth);

      showMessage(
        $("#adminMessage"),
        t("adminOnly"),
        "error"
      );

      return;
    }

    if (isAdmin) {
      await loadAdminContent();
      await loadAdminQuestions();
      await loadContributors();
    }
  });
}

/* =========================================
   ADMIN QUESTION MANAGER
========================================= */

function getQuestionFormData() {
  return {
    subject: normalizeSubject(
      $("#mcqSubject")?.value || ""
    ),

    chapter: $("#mcqChapter")?.value.trim() || "",

    question: $("#mcqQuestion")?.value.trim() || "",

    options: [
      $("#mcqOption0")?.value.trim() || "",
      $("#mcqOption1")?.value.trim() || "",
      $("#mcqOption2")?.value.trim() || "",
      $("#mcqOption3")?.value.trim() || ""
    ],

    answer: Number($("#mcqAnswer")?.value),

    explanation:
      $("#mcqExplanation")?.value.trim() || ""
  };
}

function validateQuestion(data) {
  return Boolean(
    data.subject &&
    data.chapter &&
    data.question &&
    data.options.every(Boolean) &&
    data.answer >= 0 &&
    data.answer <= 3
  );
}

function setupQuestionForm() {
  $("#mcqForm")?.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      if (!currentUser || currentUser.uid !== ADMIN_UID) {
        return;
      }

      const data = getQuestionFormData();

      if (!validateQuestion(data)) {
        showMessage(
          $("#adminStatus"),
          "Please complete all question fields.",
          "error"
        );

        return;
      }

      try {
        if (editingQuestionId) {
          await updateDoc(
            doc(
              db,
              QUESTIONS_COLLECTION,
              editingQuestionId
            ),
            {
              ...data,
              updatedAt: serverTimestamp()
            }
          );

        } else {
          await addDoc(
            collection(db, QUESTIONS_COLLECTION),
            {
              ...data,
              createdAt: serverTimestamp()
            }
          );
        }

        $("#mcqForm").reset();

        editingQuestionId = null;

        const saveButton = $("#saveMcq");

        if (saveButton) {
          saveButton.textContent = "Save question";
        }

        const cancelButton = $("#cancelEdit");

        if (cancelButton) {
          cancelButton.hidden = true;
        }

        showMessage(
          $("#adminStatus"),
          t("saved"),
          "success"
        );

        await loadQuestions();
        await loadAdminQuestions();

      } catch (error) {
        console.error("MCQ save error:", error);

        showMessage(
          $("#adminStatus"),
          t("error"),
          "error"
        );
      }
    }
  );

  $("#cancelEdit")?.addEventListener("click", () => {
    editingQuestionId = null;

    $("#mcqForm")?.reset();

    const saveButton = $("#saveMcq");

    if (saveButton) {
      saveButton.textContent = "Save question";
    }

    const cancelButton = $("#cancelEdit");

    if (cancelButton) {
      cancelButton.hidden = true;
    }
  });
}

async function loadAdminQuestions() {
  const container = $("#adminMcqList");

  if (!container) return;

  try {
    const snapshot = await getDocs(
      collection(db, QUESTIONS_COLLECTION)
    );

    if (!snapshot.docs.length) {
      container.textContent = "No MCQs found.";
      return;
    }

    container.innerHTML = snapshot.docs.map(item => {
      const question = item.data();

      return `
        <div class="admin-item">

          <strong>
            ${escapeHTML(question.subject || "")}
          </strong>

          <p>
            ${escapeHTML(question.question || "")}
          </p>

          <button
            class="btn edit-question"
            type="button"
            data-id="${escapeHTML(item.id)}">
            Edit
          </button>

          <button
            class="btn btn-danger delete-question"
            type="button"
            data-id="${escapeHTML(item.id)}">
            Delete
          </button>

        </div>
      `;
    }).join("");

    $$(".edit-question").forEach(button => {
      button.addEventListener("click", () => {
        editQuestion(button.dataset.id, snapshot.docs);
      });
    });

    $$(".delete-question").forEach(button => {
      button.addEventListener("click", async () => {
        await removeQuestion(button.dataset.id);
      });
    });

  } catch (error) {
    console.error("Admin question list error:", error);

    container.textContent = "Could not load questions.";
  }
}

function editQuestion(id, documents) {
  const selected = documents.find(item => item.id === id);

  if (!selected) return;

  const data = selected.data();

  editingQuestionId = id;

  $("#mcqSubject").value =
    normalizeSubject(data.subject || "");

  $("#mcqChapter").value = data.chapter || "";
  $("#mcqQuestion").value = data.question || "";

  (data.options || []).forEach((option, index) => {
    const field = $(`#mcqOption${index}`);

    if (field) {
      field.value = option;
    }
  });

  $("#mcqAnswer").value = String(data.answer ?? 0);

  $("#mcqExplanation").value =
    data.explanation || "";

  const saveButton = $("#saveMcq");

  if (saveButton) {
    saveButton.textContent = "Update MCQ";
  }

  const cancelButton = $("#cancelEdit");

  if (cancelButton) {
    cancelButton.hidden = false;
  }

  $("#mcqForm")?.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

async function removeQuestion(id) {
  if (!currentUser || currentUser.uid !== ADMIN_UID) {
    return;
  }

  if (!confirm("Are you sure you want to delete this question?")) {
    return;
  }

  try {
    await deleteDoc(
      doc(db, QUESTIONS_COLLECTION, id)
    );

    showMessage(
      $("#adminStatus"),
      t("deleted"),
      "success"
    );

    await loadQuestions();
    await loadAdminQuestions();

  } catch (error) {
    console.error("Delete question error:", error);

    showMessage(
      $("#adminStatus"),
      t("error"),
      "error"
    );
  }
}

/* =========================================
   ADMIN WEBSITE CONTENT
========================================= */

async function loadAdminContent() {
  try {
    const snapshot = await getDoc(
      doc(db, CONTENT_COLLECTION, "main")
    );

    if (!snapshot.exists()) return;

    const data = snapshot.data();

    if ($("#contentAdminName")) {
      $("#contentAdminName").value =
        data.adminName || "";
    }

    if ($("#contentAdminPhoto")) {
      $("#contentAdminPhoto").value =
        data.adminPhoto || "";
    }

    if ($("#contentWelcome")) {
      $("#contentWelcome").value =
        data.welcomeMessage || "";
    }

    if ($("#contentWhatsapp")) {
      $("#contentWhatsapp").value =
        data.whatsapp || "";
    }

    if ($("#contentPoster")) {
      $("#contentPoster").value =
        data.poster || "";
    }

    if ($("#contentAd")) {
      $("#contentAd").value =
        data.advertisement || "";
    }

  } catch (error) {
    console.error("Admin content loading error:", error);
  }
}

function setupContentForm() {
  $("#saveSiteContent")?.addEventListener(
    "click",
    async () => {
      if (!currentUser || currentUser.uid !== ADMIN_UID) {
        return;
      }

      const data = {
        adminName:
          $("#contentAdminName")?.value.trim() || "",

        adminPhoto:
          $("#contentAdminPhoto")?.value.trim() || "",

        welcomeMessage:
          $("#contentWelcome")?.value.trim() || "",

        whatsapp:
          $("#contentWhatsapp")?.value.trim() || "",

        poster:
          $("#contentPoster")?.value.trim() || "",

        advertisement:
          $("#contentAd")?.value.trim() || "",

        updatedAt: serverTimestamp()
      };

      try {
        await setDoc(
          doc(db, CONTENT_COLLECTION, "main"),
          data,
          { merge: true }
        );

        showMessage(
          $("#adminStatus"),
          t("saved"),
          "success"
        );

        await loadPublicContent();

      } catch (error) {
        console.error("Content save error:", error);

        showMessage(
          $("#adminStatus"),
          t("error"),
          "error"
        );
      }
    }
  );
}

/* =========================================
   CONTRIBUTOR MANAGEMENT
========================================= */

async function loadContributors() {
  const container = $("#contributorsList");

  if (!container) return;

  try {
    const snapshot = await getDocs(
      collection(db, CONTRIBUTORS_COLLECTION)
    );

    if (!snapshot.docs.length) {
      container.textContent = "No contributors added.";
      return;
    }

    container.innerHTML = snapshot.docs.map(item => `
      <div class="admin-item">

        <span>${escapeHTML(item.id)}</span>

        <button
          class="btn btn-danger remove-contributor"
          type="button"
          data-email="${escapeHTML(item.id)}">
          Remove
        </button>

      </div>
    `).join("");

    $$(".remove-contributor").forEach(button => {
      button.addEventListener("click", async () => {
        await removeContributor(button.dataset.email);
      });
    });

  } catch (error) {
    console.error("Contributor loading error:", error);

    container.textContent = "Could not load contributors.";
  }
}

function setupContributors() {
  $("#addContributor")?.addEventListener(
    "click",
    async () => {
      if (!currentUser || currentUser.uid !== ADMIN_UID) {
        return;
      }

      const email = $("#contributorEmail")
        ?.value.trim().toLowerCase();

      if (!email || !email.includes("@")) {
        showMessage(
          $("#adminStatus"),
          "Enter a valid email address.",
          "error"
        );

        return;
      }

      try {
        await setDoc(
          doc(db, CONTRIBUTORS_COLLECTION, email),
          {
            email,
            addedAt: serverTimestamp()
          }
        );

        $("#contributorEmail").value = "";

        showMessage(
          $("#adminStatus"),
          "Contributor added.",
          "success"
        );

        await loadContributors();

      } catch (error) {
        console.error("Contributor add error:", error);

        showMessage(
          $("#adminStatus"),
          t("error"),
          "error"
        );
      }
    }
  );
}

async function removeContributor(email) {
  if (!currentUser || currentUser.uid !== ADMIN_UID) {
    return;
  }

  if (!confirm("Remove this contributor?")) {
    return;
  }

  try {
    await deleteDoc(
      doc(db, CONTRIBUTORS_COLLECTION, email)
    );

    showMessage(
      $("#adminStatus"),
      t("deleted"),
      "success"
    );

    await loadContributors();

  } catch (error) {
    console.error("Contributor removal error:", error);

    showMessage(
      $("#adminStatus"),
      t("error"),
      "error"
    );
  }
}

/* =========================================
   MOBILE NAVIGATION
========================================= */

function setupMobileMenu() {
  const toggle = $(".menu-toggle");
  const nav = $(".nav-links");

  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");

    nav.classList.toggle("active", isOpen);

    toggle.setAttribute(
      "aria-expanded",
      String(isOpen)
    );
  });

  $$(".nav-links a").forEach(link => {
    link.addEventListener("click", () => {
      nav.classList.remove("open", "active");

      toggle.setAttribute(
        "aria-expanded",
        "false"
      );
    });
  });
}

/* =========================================
   FOOTER
========================================= */

function setupFooter() {
  const year = $("#currentYear");

  if (year) {
    year.textContent = new Date().getFullYear();
  }
}

/* =========================================
   INITIALIZE WEBSITE
========================================= */

async function initializeWebsite() {
  setupLanguage();
  setupPractice();
  setupMockTest();
  setupCalculator();
  setupAdminLogin();
  setupQuestionForm();
  setupContentForm();
  setupContributors();
  setupMobileMenu();
  setupFooter();

  // Load the public question bank and website content.
  await Promise.all([
    loadQuestions(),
    loadPublicContent()
  ]);
}

initializeWebsite().catch(error => {
  console.error("Website initialization error:", error);
});
