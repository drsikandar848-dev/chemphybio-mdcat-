
/* =========================================================
   CHEMPHYBIO MDCAT — CORRECTED MAIN APPLICATION
   PART 1 OF 3
========================================================= */

import { auth, db } from "./firebase-config.js";

import {
  GoogleAuthProvider,
  signInWithPopup,
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
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import {
  savePremiumSystemQuestion,
  loadPremiumSystemQuestions,
  deletePremiumSystemQuestion,
  createMembershipPackage,
  loadMembershipPackages,
  submitPremiumPayment,
  approvePremiumPayment,
  rejectPremiumPayment,
  checkPremiumMembership,
  deactivatePremiumMember,
  savePremiumPaymentSettings,
  loadPremiumPaymentSettings,
  loadPaymentRequests
} from "./premium-system.js";
/* =========================================================
   ADMIN SETTINGS
   Replace this placeholder privately with your existing UID.
========================================================= */

const ADMIN_UID = "JIiL8pKKWQbzNJuUR9mvrp0tGhr1";

/* =========================================================
   CLOUDINARY SETTINGS
========================================================= */

const CLOUDINARY_CLOUD_NAME = "uwnimowp";
const CLOUDINARY_UPLOAD_PRESET = "chemphybio_site_images";
const CLOUDINARY_FOLDER = "chemphybio-mdcat";

/* =========================================================
   FIRESTORE COLLECTIONS
========================================================= */

const QUESTIONS_COLLECTION = "questions";
const CONTENT_COLLECTION = "siteContent";
const CONTRIBUTORS_COLLECTION = "contributors";
const STUDENTS_COLLECTION = "studentProgress";

/* =========================================================
   APPLICATION STATE
========================================================= */

let currentUser = null;
let allQuestions = [];
let allPremiumQuestions = [];
let siteContent = {};

let currentQuiz = [];
let currentQuizIndex = 0;
let currentQuizScore = 0;
let currentQuizAnswered = false;

let testQuestions = [];
let testAnswers = [];
let testReview = [];
let testCurrentIndex = 0;
let testSecondsRemaining = 0;
let testInterval = null;
let testStartedAt = null;
let activeTestSubject = "All";
let testFinished = false;
let latestTestResult = null;

let studentTestHistory = [];

const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "select_account"
});

/* =========================================================
   BASIC HELPERS
========================================================= */

const $ = id => document.getElementById(id);

function showMessage(id, message, isError = false) {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.style.color = isError ? "#ff7272" : "#52d6ee";
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

function formatDate(value) {
  if (!value) return "Recently";

  const date = value.toDate
    ? value.toDate()
    : new Date(value);

  return Number.isNaN(date.getTime())
    ? "Recently"
    : date.toLocaleDateString();
}

function shuffleArray(array) {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function safeDocumentId(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_");
}

function isAdmin() {
  return Boolean(
    currentUser &&
    ADMIN_UID &&
    ADMIN_UID !== "PASTE_YOUR_EXISTING_ADMIN_UID_HERE" &&
    currentUser.uid === ADMIN_UID
  );
}

/* =========================================================
   GOOGLE LOGIN
========================================================= */

async function googleLogin(messageId) {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error("Google login error:", error);

    let message = "Login failed. Please try again.";

    if (error.code === "auth/unauthorized-domain") {
      message = "Website domain is not authorized in Firebase.";
    } else if (error.code === "auth/popup-blocked") {
      message = "Allow popups and try again.";
    } else if (error.code === "auth/popup-closed-by-user") {
      message = "Login window was closed.";
    }

    showMessage(messageId, message, true);
  }
}

$("studentGoogleLogin")?.addEventListener("click", () => {
  googleLogin("studentAuthMessage");
});

$("adminGoogleLogin")?.addEventListener("click", () => {
  googleLogin("adminLoginMessage");
});

$("studentLogout")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    showMessage("studentAuthMessage", "Logout failed.", true);
  }
});

$("adminLogout")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    showMessage("adminStatus", "Logout failed.", true);
  }
});

/* =========================================================
   AUTHENTICATION STATE
========================================================= */

onAuthStateChanged(auth, async user => {
  currentUser = user;

  if (!user) {
    $("studentLoginPanel")?.removeAttribute("hidden");
    $("studentDashboard")?.setAttribute("hidden", "");

    $("adminLoginPanel")?.removeAttribute("hidden");
    $("adminDashboard")?.setAttribute("hidden", "");

    return;
  }

  if (isAdmin()) {
    $("studentLoginPanel")?.setAttribute("hidden", "");
    $("studentDashboard")?.setAttribute("hidden", "");

    $("adminLoginPanel")?.setAttribute("hidden", "");
    $("adminDashboard")?.removeAttribute("hidden");

    if ($("adminDisplayName")) {
      $("adminDisplayName").textContent =
        user.displayName || "Administrator";
    }

    if ($("adminProfilePhoto")) {
      $("adminProfilePhoto").src = user.photoURL || "";
    }

    showMessage("adminStatus", "Administrator authenticated.");

    await loadAdminData();
  } else {
    $("adminLoginPanel")?.removeAttribute("hidden");
    $("adminDashboard")?.setAttribute("hidden", "");

    await loadStudentDashboard(user);
  }
});

/* =========================================================
   LOAD EXISTING QUESTIONS
========================================================= */

async function loadQuestions() {
  try {
    const snapshot = await getDocs(
      collection(db, QUESTIONS_COLLECTION)
    );

    allQuestions = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    })).filter(question =>
      question.question &&
      Array.isArray(question.options) &&
      question.options.length === 4 &&
      Number.isInteger(Number(question.answer)) &&
      Number(question.answer) >= 0 &&
      Number(question.answer) <= 3
    );

    updateQuestionCounts();

  } catch (error) {
    console.error("Question loading error:", error);

    showMessage(
      "mockStatus",
      "Could not load questions. Check Firestore permissions.",
      true
    );
  }
}

function updateQuestionCounts() {
  const subjectElements = {
    Biology: "biologyCount",
    Chemistry: "chemistryCount",
    Physics: "physicsCount",
    English: "englishCount",
    "Logical Reasoning": "logicalCount"
  };

  Object.entries(subjectElements).forEach(([subject, id]) => {
    const count = allQuestions.filter(
      question => question.subject === subject
    ).length;

    if ($(id)) {
      $(id).textContent = `${count} MCQs`;
    }
  });

  if ($("totalQuestionsCount")) {
    $("totalQuestionsCount").textContent = allQuestions.length;
  }

  if ($("adminTotalQuestions")) {
    $("adminTotalQuestions").textContent = allQuestions.length;
  }
}

/* =========================================================
   QUICK PRACTICE
========================================================= */

$("quickQuizStart")?.addEventListener("click", () => {
  const subject = $("subjectSelect")?.value || "Biology";
  const count = Number($("practiceQuestionCount")?.value || 10);

  startQuickPractice(subject, count);
});

document.querySelectorAll("[data-start-subject]").forEach(button => {
  button.addEventListener("click", () => {
    const subject = button.dataset.startSubject;

    if ($("subjectSelect")) {
      $("subjectSelect").value = subject;
    }

    $("practice")?.scrollIntoView({ behavior: "smooth" });

    startQuickPractice(subject, 10);
  });
});

function startQuickPractice(subject, count) {
  const available = allQuestions.filter(
    question => question.subject === subject
  );

  if (!available.length) {
    $("quizArea").innerHTML = `
      <div class="quiz-result">
        No questions available for ${escapeHTML(subject)}.
      </div>
    `;
    return;
  }

  const actualCount = Math.min(count, available.length);

  currentQuiz = shuffleArray(available).slice(0, actualCount);
  currentQuizIndex = 0;
  currentQuizScore = 0;
  currentQuizAnswered = false;

  renderQuickQuestion();
}

function renderQuickQuestion() {
  const question = currentQuiz[currentQuizIndex];

  if (!question) {
    renderQuickResult();
    return;
  }

  currentQuizAnswered = false;

  $("quizArea").innerHTML = `
    <div class="quiz-question">

      <p>Question ${currentQuizIndex + 1} of ${currentQuiz.length}</p>

      <h4>${escapeHTML(question.question)}</h4>

      ${question.options.map((option, index) => `
        <button
          class="quiz-option"
          data-quick-option="${index}"
          type="button">
          ${String.fromCharCode(65 + index)}.
          ${escapeHTML(option)}
        </button>
      `).join("")}

      <div id="quickFeedback" class="quiz-feedback"></div>

      <button id="quickNext" class="btn" type="button" disabled>
        Next Question
      </button>

    </div>
  `;

  document.querySelectorAll("[data-quick-option]").forEach(button => {
    button.addEventListener("click", () => {
      answerQuickQuestion(Number(button.dataset.quickOption));
    });
  });

  $("quickNext")?.addEventListener("click", () => {
    currentQuizIndex++;
    renderQuickQuestion();
  });
}

function answerQuickQuestion(selectedIndex) {
  if (currentQuizAnswered) return;

  currentQuizAnswered = true;

  const question = currentQuiz[currentQuizIndex];
  const correctAnswer = Number(question.answer);

  document.querySelectorAll("[data-quick-option]").forEach(button => {
    const index = Number(button.dataset.quickOption);

    button.disabled = true;

    if (index === correctAnswer) {
      button.classList.add("correct");
    } else if (index === selectedIndex) {
      button.classList.add("incorrect");
    }
  });

  if (selectedIndex === correctAnswer) {
    currentQuizScore++;

    $("quickFeedback").textContent = "Correct answer!";
    $("quickFeedback").style.color = "#42c99a";
  } else {
    $("quickFeedback").textContent =
      `Incorrect. Correct answer: ${question.options[correctAnswer]}`;

    $("quickFeedback").style.color = "#ff9292";
  }

  if (question.explanation) {
    $("quickFeedback").textContent +=
      ` Explanation: ${question.explanation}`;
  }

  $("quickNext").disabled = false;

  if (currentQuizIndex === currentQuiz.length - 1) {
    $("quickNext").textContent = "View Result";
  }
}

function renderQuickResult() {
  const percentage = Math.round(
    currentQuizScore / currentQuiz.length * 100
  );

  $("quizArea").innerHTML = `
    <div class="quiz-result">
      <h3>Practice Completed</h3>
      <p>Correct Answers: ${currentQuizScore} / ${currentQuiz.length}</p>
      <h2>${percentage}%</h2>

      <button class="btn" id="practiceAgain" type="button">
        Practice Again
      </button>
    </div>
  `;

  $("practiceAgain")?.addEventListener("click", () => {
    startQuickPractice(
      $("subjectSelect")?.value || "Biology",
      Number($("practiceQuestionCount")?.value || 10)
    );
  });
}

/* =========================================================
   AGGREGATE CALCULATOR
   Illustrative calculation only; official weightage may vary.
========================================================= */

$("calculateAggregate")?.addEventListener("click", () => {
  const matric = Number($("matricMarks")?.value);
  const matricTotal = Number($("matricTotal")?.value);

  const fsc = Number($("fscMarks")?.value);
  const fscTotal = Number($("fscTotal")?.value);

  const mdcat = Number($("mdcatMarks")?.value);
  const mdcatTotal = Number($("mdcatTotal")?.value);

  const result = $("aggregateResult");

  const values = [
    [matric, matricTotal],
    [fsc, fscTotal],
    [mdcat, mdcatTotal]
  ];

  const valid = values.every(([obtained, total]) =>
    Number.isFinite(obtained) &&
    Number.isFinite(total) &&
    total > 0 &&
    obtained >= 0 &&
    obtained <= total
  );

  if (!valid) {
    result.textContent = "Please enter valid marks and totals.";
    return;
  }

  const aggregate =
    (matric / matricTotal * 10) +
    (fsc / fscTotal * 40) +
    (mdcat / mdcatTotal * 50);

  result.textContent =
    `Illustrative aggregate: ${aggregate.toFixed(2)}% (10/40/50 weighting)`;
});

/* =========================================================
   MOBILE NAVIGATION
========================================================= */

$("menuToggle")?.addEventListener("click", () => {
  $("navLinks")?.classList.toggle("active");
});

document.querySelectorAll("#navLinks a").forEach(link => {
  link.addEventListener("click", () => {
    $("navLinks")?.classList.remove("active");
  });
});

/* =========================================================
   FOOTER YEAR
========================================================= */

if ($("currentYear")) {
  $("currentYear").textContent = new Date().getFullYear();
}

/* =========================================================
   PART 1 END — DO NOT COMMIT YET
========================================================= */

/* =========================================================
   CHEMPHYBIO MDCAT — EXAM SYSTEM
   PART 2 OF 3
========================================================= */

/* =========================================================
   TEST SETUP
========================================================= */
function updateChapterOptions() {
  const subject = $("testSubject")?.value || "All";
  const chapterBox = $("chapterSelection");
  const chapterSelect = $("testChapter");

  if (!chapterBox || !chapterSelect) return;

  chapterSelect.innerHTML = '<option value="">Choose a chapter</option>';

  if (subject === "All") {
    chapterBox.hidden = true;
    return;
  }

  const chapters = [...new Set(
    allQuestions
      .filter(q => q.subject === subject)
      .map(q => (q.chapter || "").trim())
      .filter(Boolean)
  )].sort();

  chapterBox.hidden = false;

  chapters.forEach(chapter => {
    const option = document.createElement("option");
    option.value = chapter;
    option.textContent = chapter;
    chapterSelect.appendChild(option);
  });
}

$("testSubject")?.addEventListener("change", updateChapterOptions);

$("startFullTest")?.addEventListener("click", () => {
  const subject = $("testSubject")?.value || "All";
  const count = Number($("testQuestionCount")?.value || 10);
   const chapter = $("testChapter")?.value || "";

  startFullTest(subject, count, chapter);
});

function startFullTest(subject, count, chapter = "") {
  let available = [...allQuestions];

  if (subject !== "All" && subject !== "Full MDCAT") {
    available = available.filter(
      question => question.subject === subject
    );
  }
if (chapter) {
  available = available.filter(
    question => (question.chapter || "").trim() === chapter
  );
}
  if (!available.length) {
    showMessage(
      "mockStatus",
      "No questions available for this subject.",
      true
    );
    return;
  }

  if (available.length < count) {
    showMessage(
      "mockStatus",
      `Only ${available.length} questions are available. Test will use these questions.`
    );
  } else {
    showMessage("mockStatus", "Your test is ready.");
  }

  testQuestions = shuffleArray(available).slice(
    0,
    Math.min(count, available.length)
  );

  testAnswers = new Array(testQuestions.length).fill(null);
  testReview = new Array(testQuestions.length).fill(false);

  testCurrentIndex = 0;
  testSecondsRemaining = testQuestions.length * 60;
  testStartedAt = Date.now();
  activeTestSubject = subject;
  testFinished = false;
  latestTestResult = null;

  $("mainWebsite")?.setAttribute("hidden", "");
  $("testResultScreen")?.setAttribute("hidden", "");
  $("testEnvironment")?.removeAttribute("hidden");

  renderTestQuestion();
  startTestTimer();
}

/* =========================================================
   TEST TIMER
   60 seconds per question
========================================================= */

function startTestTimer() {
  clearInterval(testInterval);

  updateTestTimerDisplay();

  testInterval = setInterval(() => {
    if (testFinished) {
      clearInterval(testInterval);
      return;
    }

    testSecondsRemaining--;

    updateTestTimerDisplay();

    if (testSecondsRemaining <= 0) {
      clearInterval(testInterval);
      finishFullTest(true);
    }
  }, 1000);
}

function updateTestTimerDisplay() {
  const minutes = Math.floor(testSecondsRemaining / 60);
  const seconds = testSecondsRemaining % 60;

  if ($("testTimer")) {
    $("testTimer").textContent =
      `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  if ($("testTimer")) {
    $("testTimer").classList.toggle(
      "timer-warning",
      testSecondsRemaining <= 60
    );
  }
}

/* =========================================================
   RENDER TEST QUESTION
========================================================= */

function renderTestQuestion() {
  const question = testQuestions[testCurrentIndex];

  if (!question) return;

  const selectedAnswer = testAnswers[testCurrentIndex];

  if ($("testSubjectTitle")) {
    $("testSubjectTitle").textContent = activeTestSubject;
  }

  if ($("testQuestionNumber")) {
    $("testQuestionNumber").textContent =
      `Question ${testCurrentIndex + 1} of ${testQuestions.length}`;
  }

  if ($("testQuestionChapter")) {
    $("testQuestionChapter").textContent =
      question.chapter || question.subject || "";
  }

  if ($("testQuestionText")) {
    $("testQuestionText").textContent = question.question;
  }

  if ($("testOptions")) {
    $("testOptions").innerHTML = question.options.map((option, index) => `
      <button
        type="button"
        class="test-option ${selectedAnswer === index ? "selected" : ""}"
        data-test-option="${index}">
        <span class="option-letter">${String.fromCharCode(65 + index)}</span>
        <span>${escapeHTML(option)}</span>
      </button>
    `).join("");
  }

  document.querySelectorAll("[data-test-option]").forEach(button => {
    button.addEventListener("click", () => {
      selectTestAnswer(Number(button.dataset.testOption));
    });
  });

  updateTestProgress();
  renderQuestionNavigator();

  if ($("testPrevious")) {
    $("testPrevious").disabled = testCurrentIndex === 0;
  }

  if ($("testNext")) {
    $("testNext").textContent =
      testCurrentIndex === testQuestions.length - 1
        ? "Finish"
        : "Next";
  }

  if ($("markForReview")) {
    $("markForReview").textContent =
      testReview[testCurrentIndex]
        ? "Remove Review Mark"
        : "Mark for Review";
  }
}

/* =========================================================
   SELECT ANSWER
========================================================= */

function selectTestAnswer(index) {
  if (testFinished) return;

  testAnswers[testCurrentIndex] = index;

  renderTestQuestion();
}

/* =========================================================
   TEST PROGRESS
========================================================= */

function updateTestProgress() {
  const answered = testAnswers.filter(
    answer => answer !== null
  ).length;

  const percentage =
    (answered / testQuestions.length) * 100;

  if ($("testProgressText")) {
    $("testProgressText").textContent =
      `${Math.round(percentage)}% Completed`;
  }

  if ($("testAnsweredText")) {
    $("testAnsweredText").textContent =
      `${answered} / ${testQuestions.length} Answered`;
  }

  if ($("testProgressBar")) {
    $("testProgressBar").style.width = `${percentage}%`;
  }
}

/* =========================================================
   QUESTION NAVIGATOR
========================================================= */

function renderQuestionNavigator() {
  if (!$("questionNavigator")) return;

  $("questionNavigator").innerHTML =
    testQuestions.map((question, index) => {
      let classes = "question-nav-btn";

      if (testAnswers[index] !== null) {
        classes += " answered";
      }

      if (testReview[index]) {
        classes += " review";
      }

      if (index === testCurrentIndex) {
        classes += " current";
      }

      return `
        <button
          type="button"
          class="${classes}"
          data-question-jump="${index}">
          ${index + 1}
        </button>
      `;
    }).join("");

  document.querySelectorAll("[data-question-jump]").forEach(button => {
    button.addEventListener("click", () => {
      testCurrentIndex = Number(button.dataset.questionJump);
      renderTestQuestion();
    });
  });
}

/* =========================================================
   PREVIOUS / NEXT / SKIP
========================================================= */

$("testPrevious")?.addEventListener("click", () => {
  if (testCurrentIndex > 0) {
    testCurrentIndex--;
    renderTestQuestion();
  }
});

$("testNext")?.addEventListener("click", () => {
  if (testCurrentIndex === testQuestions.length - 1) {
    const unanswered = testAnswers.filter(
      answer => answer === null
    ).length;

    const message = unanswered
      ? `You have ${unanswered} unanswered questions. Submit your test?`
      : "Are you sure you want to submit your test?";

    if (confirm(message)) {
      finishFullTest(false);
    }

    return;
  }

  testCurrentIndex++;
  renderTestQuestion();
});

$("testSkip")?.addEventListener("click", () => {
  if (testCurrentIndex < testQuestions.length - 1) {
    testCurrentIndex++;
    renderTestQuestion();
  } else {
    showMessage(
      "mockStatus",
      "You are on the last question. Use Finish to submit."
    );
  }
});

/* =========================================================
   MARK FOR REVIEW
========================================================= */

$("markForReview")?.addEventListener("click", () => {
  testReview[testCurrentIndex] =
    !testReview[testCurrentIndex];

  renderTestQuestion();
});

/* =========================================================
   SUBMIT TEST
========================================================= */

$("submitTest")?.addEventListener("click", () => {
  const unanswered = testAnswers.filter(
    answer => answer === null
  ).length;

  const message = unanswered
    ? `${unanswered} questions are unanswered. Submit anyway?`
    : "Submit your test now?";

  if (confirm(message)) {
    finishFullTest(false);
  }
});

/* =========================================================
   EXIT TEST
========================================================= */

$("exitTest")?.addEventListener("click", () => {
  const confirmed = confirm(
    "Exit this test? Your current answers will not be saved as a completed test."
  );

  if (!confirmed) return;

  clearInterval(testInterval);

  testFinished = true;

  $("testEnvironment")?.setAttribute("hidden", "");
  $("testResultScreen")?.setAttribute("hidden", "");
  $("mainWebsite")?.removeAttribute("hidden");
});

/* =========================================================
   FINISH TEST AND CALCULATE RESULT
========================================================= */

async function finishFullTest(autoSubmitted = false) {
  if (testFinished) return;

  testFinished = true;
  clearInterval(testInterval);

  let correct = 0;
  let wrong = 0;
  let unattempted = 0;

  testQuestions.forEach((question, index) => {
    if (testAnswers[index] === null) {
      unattempted++;
    } else if (
      Number(testAnswers[index]) === Number(question.answer)
    ) {
      correct++;
    } else {
      wrong++;
    }
  });

  const total = testQuestions.length;
  const percentage = total
    ? Math.round((correct / total) * 100)
    : 0;

  const durationSeconds = Math.max(
    0,
    Math.floor((Date.now() - testStartedAt) / 1000)
  );

  latestTestResult = {
    subject: activeTestSubject,
    total,
    correct,
    wrong,
    unattempted,
    percentage,
    durationSeconds,
    autoSubmitted,
    date: new Date().toISOString()
  };

  showTestResult(latestTestResult);

  await saveCompletedTest(latestTestResult);
}

/* =========================================================
   SHOW RESULT SCREEN
========================================================= */

function showTestResult(result) {
  $("testEnvironment")?.setAttribute("hidden", "");
  $("mainWebsite")?.setAttribute("hidden", "");
  $("testResultScreen")?.removeAttribute("hidden");

  if ($("resultPercentage")) {
    $("resultPercentage").textContent =
      `${result.percentage}%`;
  }

  if ($("resultTotal")) {
    $("resultTotal").textContent = result.total;
  }

  if ($("resultCorrect")) {
    $("resultCorrect").textContent = result.correct;
  }

  if ($("resultWrong")) {
    $("resultWrong").textContent = result.wrong;
  }

  if ($("resultUnattempted")) {
    $("resultUnattempted").textContent = result.unattempted;
  }

  if ($("resultMessage")) {
    $("resultMessage").textContent =
      result.autoSubmitted
        ? "Time is over. Your test was submitted automatically."
        : result.percentage >= 80
          ? "Excellent performance! Keep practising."
          : result.percentage >= 50
            ? "Good effort. Keep improving."
            : "Keep practising. You can improve with consistency.";
  }

  if ($("resultAnswerReview")) {
    $("resultAnswerReview").innerHTML = "";

    $("resultAnswerReview").setAttribute("hidden", "");
  }
}

/* =========================================================
   ANSWER REVIEW
========================================================= */

$("reviewAnswers")?.addEventListener("click", () => {
  const container = $("resultAnswerReview");

  if (!container) return;

  if (!container.hasAttribute("hidden")) {
    container.setAttribute("hidden", "");
    return;
  }

  container.removeAttribute("hidden");

  container.innerHTML = testQuestions.map((question, index) => {
    const correctIndex = Number(question.answer);
    const selectedIndex = testAnswers[index];

    const correctText = question.options[correctIndex];

    const selectedText = selectedIndex === null
      ? "Not attempted"
      : question.options[selectedIndex];

    const isCorrect = selectedIndex === correctIndex;

    return `
      <div class="answer-review-item">
        <h4>Question ${index + 1}</h4>

        <p>${escapeHTML(question.question)}</p>

        <p>
          <strong>Your answer:</strong>
          ${escapeHTML(selectedText)}
        </p>

        <p>
          <strong>Correct answer:</strong>
          ${escapeHTML(correctText)}
        </p>

        <p class="${isCorrect ? "correct" : "incorrect"}">
          ${isCorrect ? "Correct" : "Incorrect / Unattempted"}
        </p>

        ${
          question.explanation
            ? `<p><strong>Explanation:</strong> ${escapeHTML(question.explanation)}</p>`
            : ""
        }
      </div>
    `;
  }).join("");
});

/* =========================================================
   RETURN TO WEBSITE
========================================================= */

$("backToWebsite")?.addEventListener("click", () => {
  $("testResultScreen")?.setAttribute("hidden", "");
  $("testEnvironment")?.setAttribute("hidden", "");
  $("mainWebsite")?.removeAttribute("hidden");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
});

/* =========================================================
   SAVE COMPLETED TEST
========================================================= */

async function saveCompletedTest(result) {
  if (!currentUser || !currentUser.uid) return;

  try {
    const studentRef = doc(
      db,
      STUDENTS_COLLECTION,
      currentUser.uid
    );

    const studentSnapshot = await getDoc(studentRef);

    const oldData = studentSnapshot.exists()
      ? studentSnapshot.data()
      : {};

    await setDoc(studentRef, {
      uid: currentUser.uid,
      name: currentUser.displayName || "",
      email: currentUser.email || "",
      photoURL: currentUser.photoURL || "",
      totalTests: Number(oldData.totalTests || 0) + 1,
      totalAttempted: Number(oldData.totalAttempted || 0) + result.total,
      totalCorrect: Number(oldData.totalCorrect || 0) + result.correct,
      updatedAt: serverTimestamp()
    }, { merge: true });

    await addDoc(
      collection(
        db,
        STUDENTS_COLLECTION,
        currentUser.uid,
        "tests"
      ),
      {
        subject: result.subject,
        total: result.total,
        correct: result.correct,
        wrong: result.wrong,
        unattempted: result.unattempted,
        percentage: result.percentage,
        durationSeconds: result.durationSeconds,
        autoSubmitted: result.autoSubmitted,
        createdAt: serverTimestamp()
      }
    );

    console.log("Test result saved successfully.");

  } catch (error) {
    console.error("Test result saving error:", error);
  }
}

/* =========================================================
   PART 2 END — PART 3 WILL COMPLETE THE APPLICATION
========================================================= */

/* =========================================================
   CHEMPHYBIO MDCAT — ADMIN + STUDENT + CONTENT SYSTEM
   PART 3 OF 3
========================================================= */

/* =========================================================
   STUDENT DASHBOARD
========================================================= */

async function loadStudentDashboard(user) {
  if (!user) return;

  $("studentLoginPanel")?.setAttribute("hidden", "");
  $("studentDashboard")?.removeAttribute("hidden");

  if ($("studentPhoto")) {
    $("studentPhoto").src = user.photoURL || "";
  }

  if ($("studentName")) {
    $("studentName").textContent =
      user.displayName || "Student";
  }

  if ($("studentEmail")) {
    $("studentEmail").textContent = user.email || "";
  }

  try {
    const studentRef = doc(
      db,
      STUDENTS_COLLECTION,
      user.uid
    );

    await setDoc(studentRef, {
      uid: user.uid,
      name: user.displayName || "",
      email: user.email || "",
      photoURL: user.photoURL || "",
      lastLogin: serverTimestamp()
    }, { merge: true });

    await refreshStudentDashboard(user.uid);

  } catch (error) {
    console.error("Student dashboard error:", error);
    showMessage(
      "studentAuthMessage",
      "Could not load student data. Check Firestore permissions.",
      true
    );
  }
}

/* =========================================================
   REFRESH STUDENT STATISTICS
========================================================= */

async function refreshStudentDashboard(uid) {
  try {
    const testsRef = collection(
      db,
      STUDENTS_COLLECTION,
      uid,
      "tests"
    );

    const snapshot = await getDocs(testsRef);

    studentTestHistory = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    studentTestHistory.sort((a, b) => {
      const dateA = a.createdAt?.toMillis?.() || 0;
      const dateB = b.createdAt?.toMillis?.() || 0;
      return dateB - dateA;
    });

    const totalTests = studentTestHistory.length;

    const totalAttempted = studentTestHistory.reduce(
      (sum, test) => sum + Number(test.total || 0),
      0
    );

    const totalCorrect = studentTestHistory.reduce(
      (sum, test) => sum + Number(test.correct || 0),
      0
    );

    const average = totalTests
      ? studentTestHistory.reduce(
          (sum, test) => sum + Number(test.percentage || 0),
          0
        ) / totalTests
      : 0;

    const estimatedScore = average * 1.8;

    if ($("studentTotalTests")) {
      $("studentTotalTests").textContent = totalTests;
    }

    if ($("studentAverage")) {
      $("studentAverage").textContent =
        `${average.toFixed(1)}%`;
    }

    if ($("studentAttempted")) {
      $("studentAttempted").textContent = totalAttempted;
    }

    if ($("studentEstimatedScore")) {
      $("studentEstimatedScore").textContent =
        `${estimatedScore.toFixed(0)} / 180`;
    }

    renderSubjectPerformance();
    renderStudentTestHistory();

  } catch (error) {
    console.error("Student statistics error:", error);
  }
}

/* =========================================================
   SUBJECT PERFORMANCE
========================================================= */

function renderSubjectPerformance() {
  const container = $("subjectPerformance");
  if (!container) return;

  const subjects = [
    "Biology",
    "Chemistry",
    "Physics",
    "English",
    "Logical Reasoning",
    "All",
    "Full MDCAT"
  ];

  const stats = {};

  studentTestHistory.forEach(test => {
    const subject = test.subject || "All";

    if (!stats[subject]) {
      stats[subject] = {
        total: 0,
        correct: 0,
        tests: 0
      };
    }

    stats[subject].total += Number(test.total || 0);
    stats[subject].correct += Number(test.correct || 0);
    stats[subject].tests++;
  });

  const availableSubjects = subjects.filter(
    subject => stats[subject]
  );

  if (!availableSubjects.length) {
    container.innerHTML = "<p>No test performance available yet.</p>";
    return;
  }

  container.innerHTML = availableSubjects.map(subject => {
    const data = stats[subject];

    const percentage = data.total
      ? Math.round(data.correct / data.total * 100)
      : 0;

    return `
      <div class="subject-performance-item">
        <div class="performance-heading">
          <strong>${escapeHTML(subject)}</strong>
          <span>${percentage}%</span>
        </div>

        <div class="performance-track">
          <div class="performance-fill"
               style="width:${percentage}%"></div>
        </div>

        <small>
          ${data.correct} correct out of ${data.total}
          · ${data.tests} tests
        </small>
      </div>
    `;
  }).join("");
}

/* =========================================================
   STUDENT TEST HISTORY
========================================================= */

function renderStudentTestHistory() {
  const container = $("studentTestHistory");
  if (!container) return;

  if (!studentTestHistory.length) {
    container.innerHTML = "<p>No completed tests yet.</p>";
    return;
  }

  container.innerHTML = studentTestHistory.map(test => `
    <div class="student-history-item">
      <div>
        <strong>${escapeHTML(test.subject || "Practice Test")}</strong>
        <small>${formatDate(test.createdAt)}</small>
      </div>

      <div>
        <strong>${Number(test.percentage || 0).toFixed(1)}%</strong>
        <small>
          ${Number(test.correct || 0)} / ${Number(test.total || 0)}
          correct
        </small>
      </div>
    </div>
  `).join("");
}

/* =========================================================
   ADMIN DASHBOARD
========================================================= */

async function loadAdminData() {
  if (!isAdmin()) return;

  try {
    await Promise.all([
      loadQuestions(),
      loadSiteContent(),
      loadContributors(),
      loadStudents()
    ]);

    showMessage("adminStatus", "Admin dashboard loaded.");

  } catch (error) {
    console.error("Admin loading error:", error);
    showMessage("adminStatus", "Some admin data could not load.", true);
  }
}

/* =========================================================
   ADMIN TAB NAVIGATION
========================================================= */

document.querySelectorAll("[data-admin-tab]").forEach(button => {
  button.addEventListener("click", () => {
    const tab = button.dataset.adminTab;

    document.querySelectorAll("[data-admin-tab]").forEach(item => {
      item.classList.toggle("active", item === button);
    });

    const panels = {
  questions: "adminQuestionsPanel",
  content: "adminContentPanel",
  contributors: "adminContributorsPanel",
  students: "adminStudentsPanel"
};

    Object.entries(panels).forEach(([name, id]) => {
      const panel = $(id);
      if (!panel) return;

      if (name === tab) {
        panel.removeAttribute("hidden");
      } else {
        panel.setAttribute("hidden", "");
      }
    });
  });
});

/* =========================================================
   ADMIN MCQ MANAGER
========================================================= */


$("mcqForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!isAdmin()) return;

  const question = $("mcqQuestion")?.value.trim();
  const subject = $("mcqSubject")?.value;
  const chapter = $("mcqChapter")?.value.trim();
  const accessType = $("mcqAccessType")?.value || "free";

  const options = [
    $("mcqOption0")?.value.trim(),
    $("mcqOption1")?.value.trim(),
    $("mcqOption2")?.value.trim(),
    $("mcqOption3")?.value.trim()
  ];

  const answer = Number($("mcqAnswer")?.value);
  const explanation = $("mcqExplanation")?.value.trim();
  const editingId = $("editingQuestionId")?.value;

  if (
    !question ||
    !subject ||
    !chapter ||
    options.some(option => !option) ||
    !Number.isInteger(answer) ||
    answer < 0 ||
    answer > 3
  ) {
    showMessage("adminStatus", "Please complete all MCQ fields.", true);
    return;
  }

  try {
    if (editingId && accessType === "premium") {
      showMessage(
        "adminStatus",
        "Premium editing will be enabled in the next step.",
        true
      );
      return;
    }

    const questionData = {
      question,
      subject,
      chapter,
      options,
      answer,
      explanation
    };

    if (editingId) {
      await updateDoc(
        doc(db, QUESTIONS_COLLECTION, editingId),
        {
          ...questionData,
          updatedAt: serverTimestamp()
        }
      );

      showMessage("adminStatus", "Free question updated successfully.");

    } else if (accessType === "premium") {

      await savePremiumSystemQuestion(questionData, "premium");

      showMessage("adminStatus", "Premium question added successfully.");

    } else {

      await addDoc(
        collection(db, QUESTIONS_COLLECTION),
        {
          ...questionData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }
      );

      showMessage("adminStatus", "Free question added successfully.");
    }

    $("mcqForm").reset();

    if ($("editingQuestionId")) {
      $("editingQuestionId").value = "";
    }

    if ($("saveMcq")) {
      $("saveMcq").textContent = "Save Question";
    }

    $("cancelEdit")?.setAttribute("hidden", "");

    await loadQuestions();
    renderAdminMcqList();

  } catch (error) {
    console.error("MCQ save error:", error);

    showMessage(
      "adminStatus",
      error.message || "Could not save question.",
      true
    );
  }
});


/* =========================================================
   RENDER ADMIN MCQ LIST
========================================================= */

function renderAdminMcqList() {
  const container = $("adminMcqList");
  if (!container) return;

  if (!allQuestions.length) {
    container.innerHTML = "<p>No questions found.</p>";
    return;
  }

  container.innerHTML = allQuestions.map(question => `
    <div class="admin-mcq-item">
      <div>
        <strong>${escapeHTML(question.subject || "Subject")}</strong>
        <p>${escapeHTML(question.question)}</p>
        <small>${escapeHTML(question.chapter || "")}</small>
      </div>

      <div class="admin-mcq-actions">
        <button type="button"
          data-edit-question="${escapeHTML(question.id)}">
          Edit
        </button>

        <button type="button"
          data-delete-question="${escapeHTML(question.id)}">
          Delete
        </button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll("[data-edit-question]").forEach(button => {
    button.addEventListener("click", () => {
      editQuestion(button.dataset.editQuestion);
    });
  });

  container.querySelectorAll("[data-delete-question]").forEach(button => {
    button.addEventListener("click", () => {
      deleteQuestion(button.dataset.deleteQuestion);
    });
  });
}

/* =========================================================
   EDIT QUESTION
========================================================= */

function editQuestion(id) {
  const question = allQuestions.find(item => item.id === id);
  if (!question) return;

  $("editingQuestionId").value = question.id;
  $("mcqQuestion").value = question.question || "";
  $("mcqSubject").value = question.subject || "";
  $("mcqChapter").value = question.chapter || "";

  question.options.forEach((option, index) => {
    const input = $(`mcqOption${index}`);
    if (input) input.value = option;
  });

  $("mcqAnswer").value = String(question.answer);

  $("mcqExplanation").value = question.explanation || "";

  if ($("saveMcq")) {
    $("saveMcq").textContent = "Update Question";
  }

  $("cancelEdit")?.removeAttribute("hidden");

  $("mcqForm")?.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

/* =========================================================
   CANCEL QUESTION EDIT
========================================================= */

$("cancelEdit")?.addEventListener("click", () => {
  $("mcqForm")?.reset();

  if ($("editingQuestionId")) {
    $("editingQuestionId").value = "";
  }

  if ($("saveMcq")) {
    $("saveMcq").textContent = "Save Question";
  }

  $("cancelEdit")?.setAttribute("hidden", "");
});

/* =========================================================
   DELETE QUESTION
========================================================= */

async function deleteQuestion(id) {
  if (!isAdmin()) return;

  if (!confirm("Are you sure you want to delete this question?")) {
    return;
  }

  try {
    await deleteDoc(doc(db, QUESTIONS_COLLECTION, id));

    showMessage("adminStatus", "Question deleted.");

    await loadQuestions();
    renderAdminMcqList();

  } catch (error) {
    console.error("Question deletion error:", error);
    showMessage("adminStatus", "Could not delete question.", true);
  }
}

/* =========================================================
   CLOUDINARY GALLERY IMAGE UPLOAD
========================================================= */

async function uploadImageToCloudinary(file) {
  if (!file) return "";

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("Please select a JPG, PNG or WEBP image.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Image must be smaller than 5 MB.");
  }

  const formData = new FormData();

  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", CLOUDINARY_FOLDER);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    {
      method: "POST",
      body: formData
    }
  );

  const data = await response.json();

  if (!response.ok || !data.secure_url) {
    throw new Error(
      data.error?.message || "Image upload failed."
    );
  }

  return data.secure_url;
}

/* =========================================================
   LOAD WEBSITE CONTENT
========================================================= */

async function loadSiteContent() {
  try {
    const contentRef = doc(
      db,
      CONTENT_COLLECTION,
      "main"
    );

    const snapshot = await getDoc(contentRef);

    if (!snapshot.exists()) return;

    siteContent = snapshot.data();

    if ($("adminPublicName")) {
      $("adminPublicName").textContent =
        siteContent.adminName || "CHEMPHYBIO MDCAT";
    }
if ($("adminPublicPhoto")) {
  const adminPhoto = siteContent.adminPhoto;

  if (adminPhoto) {
    $("adminPublicPhoto").src = adminPhoto;
    $("adminPublicPhoto").hidden = false;
  } else {
    $("adminPublicPhoto").hidden = true;
  }
}

    if ($("welcomeMessage")) {
      $("welcomeMessage").textContent =
        siteContent.welcomeMessage || "";
    }

    if ($("whatsappCommunity")) {
      $("whatsappCommunity").href =
        siteContent.whatsappLink || "#";
    }

    if ($("posterTitle")) {
      $("posterTitle").textContent =
        siteContent.posterTitle || "";
    }

    if ($("posterImage") && siteContent.posterImage) {
      $("posterImage").src = siteContent.posterImage;
    }

    if ($("posterCard")) {
      $("posterCard").hidden = !siteContent.posterImage;
    }

    if ($("advertisementTitle")) {
      $("advertisementTitle").textContent =
        siteContent.adTitle || "";
    }

    if ($("advertisementImage") && siteContent.adImage) {
      $("advertisementImage").src = siteContent.adImage;
    }

    if ($("advertisementCard")) {
      $("advertisementCard").hidden = !siteContent.adImage;
    }

    if ($("splashTitle")) {
      $("splashTitle").textContent =
        siteContent.announcementTitle || "CHEMPHYBIO MDCAT";
    }

    if ($("splashMessage")) {
      $("splashMessage").textContent =
        siteContent.announcement || "";
    }

    if ($("splashImage") && siteContent.announcementImage) {
      $("splashImage").src = siteContent.announcementImage;
    }

    if ($("contentAdminName")) {
      $("contentAdminName").value =
        siteContent.adminName || "";
    }

    if ($("contentWelcome")) {
      $("contentWelcome").value =
        siteContent.welcomeMessage || "";
    }

    if ($("contentWhatsapp")) {
      $("contentWhatsapp").value =
        siteContent.whatsappLink || "";
    }

    if ($("contentPosterTitle")) {
      $("contentPosterTitle").value =
        siteContent.posterTitle || "";
    }

    if ($("contentAnnouncement")) {
      $("contentAnnouncement").value =
        siteContent.announcement || "";
    }

    if ($("contentAdTitle")) {
      $("contentAdTitle").value =
        siteContent.adTitle || "";
    }

    showAnnouncementSplash();

  } catch (error) {
    console.error("Site content loading error:", error);
  }
}

/* =========================================================
   ANNOUNCEMENT SPLASH
========================================================= */

function showAnnouncementSplash() {
  const splash = $("announcementSplash");

  if (!splash) return;

  splash.hidden = false;

  setTimeout(() => {
    splash.hidden = true;
  }, 3000);
}

/* =========================================================
   ADMIN CONTENT FORM
   Uploads selected Gallery images and saves content.
========================================================= */

$("adminContentForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!isAdmin()) return;

  const submitButton = $("saveSiteContent");

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Saving...";
  }

  try {
    const adminPhotoFile =
      $("contentAdminPhotoFile")?.files?.[0];

    const posterFile =
      $("contentPosterFile")?.files?.[0];

    const adFile =
      $("contentAdFile")?.files?.[0];

    if (adminPhotoFile) {
      showMessage("adminPhotoUploadStatus", "Uploading admin photo...");
    }

    if (posterFile) {
      showMessage("posterUploadStatus", "Uploading poster...");
    }

    if (adFile) {
      showMessage("adUploadStatus", "Uploading advertisement...");
    }

    const adminPhoto = adminPhotoFile
      ? await uploadImageToCloudinary(adminPhotoFile)
      : siteContent.adminPhoto || "";

    if (adminPhotoFile) {
      showMessage("adminPhotoUploadStatus", "Admin photo uploaded.");
    }

    const posterImage = posterFile
      ? await uploadImageToCloudinary(posterFile)
      : siteContent.posterImage || "";

    if (posterFile) {
      showMessage("posterUploadStatus", "Poster uploaded.");
    }

    const adImage = adFile
      ? await uploadImageToCloudinary(adFile)
      : siteContent.adImage || "";

    if (adFile) {
      showMessage("adUploadStatus", "Advertisement uploaded.");
    }

    const contentData = {
      adminName: $("contentAdminName")?.value.trim() || "",
      adminPhoto,

      welcomeMessage:
        $("contentWelcome")?.value.trim() || "",

      whatsappLink:
        $("contentWhatsapp")?.value.trim() || "",

      posterTitle:
        $("contentPosterTitle")?.value.trim() || "",

      posterImage,

      announcement:
        $("contentAnnouncement")?.value.trim() || "",

      announcementTitle:
        $("splashTitle")?.textContent || "CHEMPHYBIO MDCAT",

      announcementImage:
        posterImage,

      adTitle:
        $("contentAdTitle")?.value.trim() || "",

      adImage,

      updatedAt: serverTimestamp()
    };

    await setDoc(
      doc(db, CONTENT_COLLECTION, "main"),
      contentData,
      { merge: true }
    );

    siteContent = {
      ...siteContent,
      ...contentData
    };

    await loadSiteContent();

    showMessage("adminStatus", "Website content saved successfully.");

  } catch (error) {
    console.error("Content saving error:", error);
    showMessage("adminStatus", error.message || "Content upload failed.", true);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Save Content";
    }
  }
});

/* =========================================================
   CONTRIBUTORS MANAGEMENT
========================================================= */

$("addContributor")?.addEventListener("click", async () => {
  if (!isAdmin()) return;

  const email = $("contributorEmail")?.value
    .trim()
    .toLowerCase();

  if (!email || !email.includes("@")) {
    showMessage("adminStatus", "Enter a valid contributor email.", true);
    return;
  }

  try {
    await setDoc(
      doc(db, CONTRIBUTORS_COLLECTION, email),
      {
        email,
        addedAt: serverTimestamp(),
        addedBy: currentUser.uid
      },
      { merge: true }
    );

    $("contributorEmail").value = "";

    showMessage("adminStatus", "Contributor added successfully.");

    await loadContributors();

  } catch (error) {
    console.error("Contributor error:", error);
    showMessage("adminStatus", "Could not add contributor.", true);
  }
});

async function loadContributors() {
  if (!isAdmin()) return;

  try {
    const snapshot = await getDocs(
      collection(db, CONTRIBUTORS_COLLECTION)
    );

    const container = $("contributorsList");

    if ($("adminTotalContributors")) {
      $("adminTotalContributors").textContent = snapshot.size;
    }

    if (!container) return;

    if (snapshot.empty) {
      container.innerHTML = "<p>No contributors added yet.</p>";
      return;
    }

    container.innerHTML = snapshot.docs.map(item => {
      const contributor = item.data();

      return `
        <div class="contributor-item">
          <span>${escapeHTML(contributor.email || item.id)}</span>

          <button type="button"
            data-remove-contributor="${escapeHTML(item.id)}">
            Remove
          </button>
        </div>
      `;
    }).join("");

    container.querySelectorAll("[data-remove-contributor]")
      .forEach(button => {
        button.addEventListener("click", async () => {
          const email = button.dataset.removeContributor;

          if (!confirm(`Remove contributor ${email}?`)) return;

          try {
            await deleteDoc(
              doc(db, CONTRIBUTORS_COLLECTION, email)
            );

            await loadContributors();

            showMessage("adminStatus", "Contributor removed.");

          } catch (error) {
            console.error(error);
            showMessage("adminStatus", "Could not remove contributor.", true);
          }
        });
      });

  } catch (error) {
    console.error("Contributor loading error:", error);
  }
}

/* =========================================================
   ADMIN STUDENT LIST
========================================================= */

$("refreshStudents")?.addEventListener("click", () => {
  loadStudents();
});

async function loadStudents() {
  if (!isAdmin()) return;

  try {
    const snapshot = await getDocs(
      collection(db, STUDENTS_COLLECTION)
    );

    const container = $("adminStudentsList");

    if ($("adminTotalStudents")) {
      $("adminTotalStudents").textContent = snapshot.size;
    }

    if (!container) return;

    if (snapshot.empty) {
      container.innerHTML = "<p>No student profiles found yet.</p>";
      return;
    }

    container.innerHTML = snapshot.docs.map(item => {
      const student = item.data();

      return `
        <div class="admin-student-item">
          <div>
            <strong>${escapeHTML(student.name || "Student")}</strong>
            <p>${escapeHTML(student.email || "")}</p>
          </div>

          <div>
            <span>Tests: ${Number(student.totalTests || 0)}</span>
            <span>MCQs: ${Number(student.totalAttempted || 0)}</span>
          </div>
        </div>
      `;
    }).join("");

  } catch (error) {
    console.error("Student list error:", error);
    showMessage("adminStatus", "Could not load student list.", true);
  }
}

/* =========================================================
   INITIALIZE APPLICATION
========================================================= */

async function initializeApplication() {
  await loadQuestions();

  renderAdminMcqList();

  await loadSiteContent();

  console.log("CHEMPHYBIO MDCAT application initialized.");
}

initializeApplication();

/* =========================================================
   END OF COMPLETE SCRIPT.JS
========================================================= */
