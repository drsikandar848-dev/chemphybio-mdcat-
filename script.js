/* =========================================================
   CHEMPHYBIO MDCAT — MAIN APPLICATION
   Corrected Premium Application
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

/* =========================================================
   ADMIN UID
   Replace placeholder with your existing Admin UID.
   Never share your UID publicly.
========================================================= */

const ADMIN_UID = "JIiL8pKKWQbzNJuUR9mvrp0tGhr1";

/* =========================================================
   CLOUDINARY SETTINGS
========================================================= */

const CLOUDINARY_CLOUD_NAME = "uwnimowp";
const CLOUDINARY_UPLOAD_PRESET = "chemphybio_site_images";
const CLOUDINARY_FOLDER = "chemphybio-mdcat";

/* =========================================================
   COLLECTIONS
========================================================= */

const QUESTIONS_COLLECTION = "questions";
const CONTENT_COLLECTION = "siteContent";
const CONTRIBUTORS_COLLECTION = "contributors";
const STUDENTS_COLLECTION = "studentProgress";

/* =========================================================
   APPLICATION STATE
========================================================= */

let allQuestions = [];
let currentUser = null;
let currentLanguage = "en";

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

let editingQuestionId = null;
let siteContent = {};
let studentTestHistory = [];

const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "select_account"
});

/* =========================================================
   HELPERS
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

function setButtonLoading(button, loading, text = "Please wait...") {
  if (!button) return;

  if (loading) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = text;
  } else {
    button.disabled = false;
    button.textContent =
      button.dataset.originalText || button.textContent;
  }
}

function isAdmin() {
  return Boolean(
    currentUser &&
    ADMIN_UID !== "PASTE_YOUR_EXISTING_ADMIN_UID_HERE" &&
    ADMIN_UID &&
    currentUser.uid === ADMIN_UID
  );
}

function safeDocumentId(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_");
}

/* =========================================================
   GOOGLE AUTHENTICATION
========================================================= */

async function googleLogin(buttonId, messageId) {
  const button = $(buttonId);

  try {
    setButtonLoading(button, true, "Connecting...");

    await signInWithPopup(auth, googleProvider);

  } catch (error) {
    console.error("Google login error:", error);

    let message = "Login failed. Please try again.";

    if (error.code === "auth/unauthorized-domain") {
      message = "This website domain is not authorized in Firebase.";
    } else if (error.code === "auth/popup-blocked") {
      message = "Allow popups and try again.";
    } else if (error.code === "auth/popup-closed-by-user") {
      message = "Login window was closed.";
    }

    showMessage(messageId, message, true);

  } finally {
    setButtonLoading(button, false);
  }
}

$("studentGoogleLogin")?.addEventListener("click", () => {
  googleLogin("studentGoogleLogin", "studentAuthMessage");
});

$("adminGoogleLogin")?.addEventListener("click", () => {
  googleLogin("adminGoogleLogin", "adminLoginMessage");
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
   AUTH STATE
========================================================= */

onAuthStateChanged(auth, async user => {
  currentUser = user;

  if (!user) {
    showStudentLoggedOut();
    showAdminLoggedOut();
    return;
  }

  await loadStudentDashboard(user);

  if (isAdmin()) {
    showAdminLoggedIn(user);
    await loadAdminData();
  } else {
    showAdminLoggedOut();
  }
});

function showStudentLoggedOut() {
  $("studentLoginPanel")?.removeAttribute("hidden");
  $("studentDashboard")?.setAttribute("hidden", "");
}

function showAdminLoggedOut() {
  $("adminLoginPanel")?.removeAttribute("hidden");
  $("adminDashboard")?.setAttribute("hidden", "");
}

function showAdminLoggedIn(user) {
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
}

/* =========================================================
   LOAD QUESTIONS
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

    updateSubjectCounts();
    updateQuestionStats();

  } catch (error) {
    console.error("Question loading error:", error);

    showMessage(
      "mockStatus",
      "Unable to load questions. Check Firestore rules.",
      true
    );
  }
}

function updateSubjectCounts() {
  const subjects = {
    Biology: "biologyCount",
    Chemistry: "chemistryCount",
    Physics: "physicsCount",
    English: "englishCount",
    "Logical Reasoning": "logicalCount"
  };

  Object.entries(subjects).forEach(([subject, id]) => {
    const count = allQuestions.filter(
      question => question.subject === subject
    ).length;

    if ($(id)) {
      $(id).textContent = `${count} MCQs`;
    }
  });
}

function updateQuestionStats() {
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
        No questions are currently available for
        ${escapeHTML(subject)}.
      </div>
    `;
    return;
  }

  currentQuiz = shuffleArray(available).slice(0, count);
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

      <button
        class="btn"
        id="quickNext"
        type="button"
        disabled>
        Next Question
      </button>
    </div>
  `;

  document.querySelectorAll("[data-quick-option]").forEach(button => {
    button.addEventListener("click", () => {
      answerQuickQuestion(
        Number(button.dataset.quickOption)
      );
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
    (currentQuizScore / currentQuiz.length) * 100
  );

  $("quizArea").innerHTML = `
    <div class="quiz-result">
      <h3>Practice Completed</h3>

      <p>
        Correct Answers:
        ${currentQuizScore} / ${currentQuiz.length}
      </p>

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
   PART 1 END
   Part 2 will continue in the same file.
========================================================= */
/* =========================================================
   FULL EXAM SYSTEM
========================================================= */

const TEST_LENGTHS = [10, 20, 30, 40, 50, 70, 80, 100, 180];

const SUBJECT_NAMES = [
  "Biology",
  "Chemistry",
  "Physics",
  "English",
  "Logical Reasoning",
  "All"
];

function getTestDuration(count) {
  return count * 60;
}

function startFullTest(subject, requestedCount) {
  if (!currentUser) {
    alert("Please login with Google before starting a test.");
    return;
  }

  if (isAdmin()) {
    alert("Please use a student account to attempt tests.");
    return;
  }

  const count = Number(requestedCount);

  if (!Number.isInteger(count) || count < 1 || count > 180) {
    alert("Invalid test length.");
    return;
  }

  let available = allQuestions.filter(question =>
    subject === "All" || question.subject === subject
  );

  if (!available.length) {
    alert("No questions available for this test.");
    return;
  }

  if (available.length < count) {
    alert(
      `Only ${available.length} questions are available. Please choose a smaller test.`
    );
    return;
  }

  testQuestions = shuffleArray(available).slice(0, count);
  testAnswers = Array(count).fill(null);
  testReview = Array(count).fill(false);

  testCurrentIndex = 0;
  testSecondsRemaining = getTestDuration(count);
  testStartedAt = Date.now();
  activeTestSubject = subject;
  testFinished = false;

  $("testSetup")?.setAttribute("hidden", "");
  $("testInterface")?.removeAttribute("hidden");

  renderTestQuestion();
  renderQuestionNavigator();
  updateTestTimer();

  clearInterval(testInterval);

  testInterval = setInterval(() => {
    if (testFinished) {
      clearInterval(testInterval);
      return;
    }

    testSecondsRemaining--;

    updateTestTimer();

    if (testSecondsRemaining <= 0) {
      clearInterval(testInterval);
      finishFullTest(true);
    }
  }, 1000);
}

/* =========================================================
   TEST SETUP BUTTONS
========================================================= */

$("startFullTest")?.addEventListener("click", () => {
  const subject = $("testSubject")?.value || "All";
  const count = Number($("testLength")?.value || 10);

  startFullTest(subject, count);
});

document.querySelectorAll("[data-test-subject]").forEach(button => {
  button.addEventListener("click", () => {
    const subject = button.dataset.testSubject;

    if ($("testSubject")) {
      $("testSubject").value = subject;
    }

    $("testSetup")?.scrollIntoView({ behavior: "smooth" });
  });
});

/* =========================================================
   TIMER
========================================================= */

function updateTestTimer() {
  const minutes = Math.floor(testSecondsRemaining / 60);
  const seconds = testSecondsRemaining % 60;

  const display =
    `${String(minutes).padStart(2, "0")}:` +
    `${String(seconds).padStart(2, "0")}`;

  if ($("testTimer")) {
    $("testTimer").textContent = display;
  }

  if ($("testTimer")) {
    $("testTimer").classList.toggle(
      "timer-warning",
      testSecondsRemaining <= 300
    );
  }
}

/* =========================================================
   RENDER TEST QUESTION
========================================================= */

function renderTestQuestion() {
  if (testFinished) return;

  const question = testQuestions[testCurrentIndex];

  if (!question) return;

  const selectedAnswer = testAnswers[testCurrentIndex];

  $("testQuestionNumber").textContent =
    `Question ${testCurrentIndex + 1} of ${testQuestions.length}`;

  $("testQuestionText").textContent = question.question;

  $("testOptions").innerHTML = question.options.map(
    (option, index) => `
      <button
        class="test-option ${selectedAnswer === index ? "selected" : ""}"
        data-test-option="${index}"
        type="button">
        <span>${String.fromCharCode(65 + index)}.</span>
        ${escapeHTML(option)}
      </button>
    `
  ).join("");

  document.querySelectorAll("[data-test-option]").forEach(button => {
    button.addEventListener("click", () => {
      selectTestAnswer(Number(button.dataset.testOption));
    });
  });

  if ($("markForReview")) {
    $("markForReview").textContent =
      testReview[testCurrentIndex]
        ? "Remove Review Mark"
        : "Mark for Review";
  }

  if ($("previousQuestion")) {
    $("previousQuestion").disabled = testCurrentIndex === 0;
  }

  if ($("nextQuestion")) {
    $("nextQuestion").textContent =
      testCurrentIndex === testQuestions.length - 1
        ? "Last Question"
        : "Next";
  }

  updateTestProgress();
}

/* =========================================================
   SELECT ANSWER
========================================================= */

function selectTestAnswer(index) {
  if (testFinished) return;

  testAnswers[testCurrentIndex] = index;

  renderTestQuestion();
  renderQuestionNavigator();
}

/* =========================================================
   QUESTION NAVIGATOR
========================================================= */

function renderQuestionNavigator() {
  const navigator = $("questionNavigator");

  if (!navigator) return;

  navigator.innerHTML = testQuestions.map((question, index) => {
    let classes = "question-nav-item";

    if (testAnswers[index] !== null) {
      classes += " answered";
    }

    if (testReview[index]) {
      classes += " review";
    }

    if (index === testCurrentIndex) {
      classes += " active";
    }

    return `
      <button
        class="${classes}"
        data-nav-question="${index}"
        type="button">
        ${index + 1}
      </button>
    `;
  }).join("");

  document.querySelectorAll("[data-nav-question]").forEach(button => {
    button.addEventListener("click", () => {
      testCurrentIndex = Number(button.dataset.navQuestion);

      renderTestQuestion();
      renderQuestionNavigator();
    });
  });
}

/* =========================================================
   TEST PROGRESS
========================================================= */

function updateTestProgress() {
  const answered = testAnswers.filter(
    answer => answer !== null
  ).length;

  const total = testQuestions.length;

  if ($("testAnsweredCount")) {
    $("testAnsweredCount").textContent = answered;
  }

  if ($("testRemainingCount")) {
    $("testRemainingCount").textContent = total - answered;
  }

  if ($("testProgressBar")) {
    $("testProgressBar").style.width =
      `${(answered / total) * 100}%`;
  }
}

/* =========================================================
   PREVIOUS / NEXT / SKIP
========================================================= */

$("previousQuestion")?.addEventListener("click", () => {
  if (testCurrentIndex > 0) {
    testCurrentIndex--;
    renderTestQuestion();
    renderQuestionNavigator();
  }
});

$("nextQuestion")?.addEventListener("click", () => {
  if (testCurrentIndex < testQuestions.length - 1) {
    testCurrentIndex++;
    renderTestQuestion();
    renderQuestionNavigator();
  }
});

$("skipQuestion")?.addEventListener("click", () => {
  if (testCurrentIndex < testQuestions.length - 1) {
    testCurrentIndex++;
    renderTestQuestion();
    renderQuestionNavigator();
  }
});

/* =========================================================
   MARK FOR REVIEW
========================================================= */

$("markForReview")?.addEventListener("click", () => {
  testReview[testCurrentIndex] =
    !testReview[testCurrentIndex];

  renderTestQuestion();
  renderQuestionNavigator();
});

/* =========================================================
   SUBMIT CONFIRMATION
========================================================= */

$("submitTest")?.addEventListener("click", () => {
  const unanswered = testAnswers.filter(
    answer => answer === null
  ).length;

  const message = unanswered
    ? `You have ${unanswered} unanswered questions. Submit anyway?`
    : "Are you sure you want to submit your test?";

  if (confirm(message)) {
    finishFullTest(false);
  }
});

/* =========================================================
   FINISH TEST
========================================================= */

async function finishFullTest(autoSubmitted = false) {
  if (testFinished) return;

  testFinished = true;

  clearInterval(testInterval);

  let correct = 0;
  let incorrect = 0;
  let skipped = 0;

  const subjectResults = {};

  testQuestions.forEach((question, index) => {
    const selected = testAnswers[index];
    const answer = Number(question.answer);
    const subject = question.subject || "Other";

    if (!subjectResults[subject]) {
      subjectResults[subject] = {
        total: 0,
        correct: 0,
        incorrect: 0,
        skipped: 0
      };
    }

    subjectResults[subject].total++;

    if (selected === null) {
      skipped++;
      subjectResults[subject].skipped++;
    } else if (selected === answer) {
      correct++;
      subjectResults[subject].correct++;
    } else {
      incorrect++;
      subjectResults[subject].incorrect++;
    }
  });

  const total = testQuestions.length;
  const percentage = Math.round((correct / total) * 100);

  const result = {
    subject: activeTestSubject,
    total,
    correct,
    incorrect,
    skipped,
    percentage,
    subjectResults,
    autoSubmitted,
    durationSeconds: Math.max(
      0,
      Math.floor((Date.now() - testStartedAt) / 1000)
    ),
    createdAt: new Date().toISOString()
  };

  renderFullTestResult(result);

  try {
    await saveStudentTestResult(result);
  } catch (error) {
    console.error("Could not save test result:", error);

    showMessage(
      "testSaveStatus",
      "Result displayed, but saving failed. Please check Firestore rules.",
      true
    );
  }
}

/* =========================================================
   SAVE STUDENT RESULT
========================================================= */

async function saveStudentTestResult(result) {
  if (!currentUser || isAdmin()) return;

  const studentRef = doc(
    db,
    STUDENTS_COLLECTION,
    currentUser.uid
  );

  const studentSnapshot = await getDoc(studentRef);

  const previous = studentSnapshot.exists()
    ? studentSnapshot.data()
    : {};

  await setDoc(studentRef, {
    uid: currentUser.uid,
    name: currentUser.displayName || "Student",
    email: currentUser.email || "",
    photoURL: currentUser.photoURL || "",
    lastActive: serverTimestamp(),
    totalTests: Number(previous.totalTests || 0) + 1,
    totalAttempted: Number(previous.totalAttempted || 0) + result.total,
    totalCorrect: Number(previous.totalCorrect || 0) + result.correct
  }, { merge: true });

  const testsRef = collection(
    db,
    STUDENTS_COLLECTION,
    currentUser.uid,
    "tests"
  );

  await addDoc(testsRef, {
    ...result,
    createdAt: serverTimestamp()
  });

  for (const [subject, data] of Object.entries(result.subjectResults)) {
    const subjectRef = doc(
      db,
      STUDENTS_COLLECTION,
      currentUser.uid,
      "subjects",
      safeDocumentId(subject)
    );

    const subjectSnapshot = await getDoc(subjectRef);

    const old = subjectSnapshot.exists()
      ? subjectSnapshot.data()
      : {};

    await setDoc(subjectRef, {
      subject,
      total: Number(old.total || 0) + data.total,
      correct: Number(old.correct || 0) + data.correct,
      incorrect: Number(old.incorrect || 0) + data.incorrect,
      skipped: Number(old.skipped || 0) + data.skipped,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  showMessage("testSaveStatus", "Your test result has been saved.");
}

/* =========================================================
   RESULT SCREEN
========================================================= */

function renderFullTestResult(result) {
  $("testInterface")?.setAttribute("hidden", "");
  $("testResult")?.removeAttribute("hidden");

  if (!$("testResult")) return;

  $("testResult").innerHTML = `
    <div class="test-result-card">
      <h2>${result.autoSubmitted ? "Time Completed" : "Test Submitted"}</h2>

      <h1>${result.percentage}%</h1>

      <p>${result.correct} Correct out of ${result.total}</p>

      <div class="result-stats">
        <div>
          <strong>${result.correct}</strong>
          <span>Correct</span>
        </div>

        <div>
          <strong>${result.incorrect}</strong>
          <span>Incorrect</span>
        </div>

        <div>
          <strong>${result.skipped}</strong>
          <span>Skipped</span>
        </div>
      </div>

      <h3>Subject Performance</h3>

      ${Object.entries(result.subjectResults).map(
        ([subject, data]) => `
          <div class="subject-result-row">
            <strong>${escapeHTML(subject)}</strong>
            <span>${data.correct}/${data.total} correct</span>
          </div>
        `
      ).join("")}

      <button id="viewAnswerReview" class="btn" type="button">
        Review Answers
      </button>

      <button id="backToDashboard" class="btn" type="button">
        Back to Dashboard
      </button>

      <p id="testSaveStatus"></p>
    </div>
  `;

  $("viewAnswerReview")?.addEventListener("click", renderAnswerReview);

  $("backToDashboard")?.addEventListener("click", () => {
    $("testResult")?.setAttribute("hidden", "");
    $("testSetup")?.removeAttribute("hidden", "");
    $("studentDashboard")?.scrollIntoView({ behavior: "smooth" });
  });
}

/* =========================================================
   ANSWER REVIEW
========================================================= */

function renderAnswerReview() {
  $("testResult").innerHTML = `
    <div class="answer-review">
      <h2>Answer Review</h2>

      ${testQuestions.map((question, index) => {
        const selected = testAnswers[index];
        const correct = Number(question.answer);

        return `
          <div class="review-question">
            <h4>${index + 1}. ${escapeHTML(question.question)}</h4>

            <p>Your answer:
              ${selected === null
                ? "Not answered"
                : escapeHTML(question.options[selected])}
            </p>

            <p>Correct answer:
              ${escapeHTML(question.options[correct])}
            </p>

            ${question.explanation
              ? `<p>${escapeHTML(question.explanation)}</p>`
              : ""}
          </div>
        `;
      }).join("")}

      <button id="returnToResult" class="btn" type="button">
        Back to Result
      </button>
    </div>
  `;

  $("returnToResult")?.addEventListener("click", () => {
    $("testResult").innerHTML = "";
    $("testResult").removeAttribute("hidden");

    // Rebuild the result from the stored answers.
    const correct = testQuestions.reduce(
      (sum, question, index) =>
        sum + (testAnswers[index] === Number(question.answer) ? 1 : 0),
      0
    );

    const skipped = testAnswers.filter(
      answer => answer === null
    ).length;

    const incorrect = testQuestions.length - correct - skipped;

    renderFullTestResult({
      total: testQuestions.length,
      correct,
      incorrect,
      skipped,
      percentage: Math.round(correct / testQuestions.length * 100),
      subjectResults: {},
      autoSubmitted: false
    });
  });
}

/* =========================================================
   PART 2 END
   Part 3 will complete the application.
========================================================= */
/* =========================================================
   STUDENT DASHBOARD
========================================================= */

async function loadStudentDashboard(user) {
  if (!user) return;

  $("studentLoginPanel")?.setAttribute("hidden", "");
  $("studentDashboard")?.removeAttribute("hidden");

  if ($("studentName")) {
    $("studentName").textContent = user.displayName || "Student";
  }

  if ($("studentEmail")) {
    $("studentEmail").textContent = user.email || "";
  }

  if ($("studentPhoto")) {
    $("studentPhoto").src = user.photoURL || "";
  }

  if (isAdmin()) return;

  try {
    const studentRef = doc(db, STUDENTS_COLLECTION, user.uid);
    const studentSnapshot = await getDoc(studentRef);

    if (!studentSnapshot.exists()) {
      await setDoc(studentRef, {
        uid: user.uid,
        name: user.displayName || "Student",
        email: user.email || "",
        photoURL: user.photoURL || "",
        totalTests: 0,
        totalAttempted: 0,
        totalCorrect: 0,
        createdAt: serverTimestamp(),
        lastActive: serverTimestamp()
      }, { merge: true });
    } else {
      await setDoc(studentRef, {
        name: user.displayName || "Student",
        email: user.email || "",
        photoURL: user.photoURL || "",
        lastActive: serverTimestamp()
      }, { merge: true });
    }

    const updatedSnapshot = await getDoc(studentRef);
    const data = updatedSnapshot.data() || {};

    if ($("studentTotalTests")) {
      $("studentTotalTests").textContent = data.totalTests || 0;
    }

    if ($("studentAttempted")) {
      $("studentAttempted").textContent = data.totalAttempted || 0;
    }

    if ($("studentCorrect")) {
      $("studentCorrect").textContent = data.totalCorrect || 0;
    }

    const average = data.totalAttempted
      ? Math.round((data.totalCorrect / data.totalAttempted) * 100)
      : 0;

    if ($("studentAverage")) {
      $("studentAverage").textContent = `${average}%`;
    }

    const estimatedScore = data.totalAttempted
      ? Math.round((data.totalCorrect / data.totalAttempted) * 180)
      : 0;

    if ($("studentEstimatedScore")) {
      $("studentEstimatedScore").textContent = `${estimatedScore}/180`;
    }

    await loadStudentHistory(user.uid);
    await loadStudentSubjectPerformance(user.uid);

  } catch (error) {
    console.error("Student dashboard error:", error);
  }
}

/* =========================================================
   STUDENT TEST HISTORY
========================================================= */

async function loadStudentHistory(uid) {
  const historyContainer = $("studentTestHistory");
  if (!historyContainer) return;

  try {
    const snapshot = await getDocs(
      collection(db, STUDENTS_COLLECTION, uid, "tests")
    );

    studentTestHistory = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    studentTestHistory.sort((a, b) => {
      const dateA = a.createdAt?.toMillis
        ? a.createdAt.toMillis()
        : new Date(a.createdAt || 0).getTime();

      const dateB = b.createdAt?.toMillis
        ? b.createdAt.toMillis()
        : new Date(b.createdAt || 0).getTime();

      return dateB - dateA;
    });

    if (!studentTestHistory.length) {
      historyContainer.innerHTML =
        "<p>No test history yet. Start your first test!</p>";
      return;
    }

    historyContainer.innerHTML = studentTestHistory.map(test => `
      <div class="history-item">
        <div>
          <strong>${escapeHTML(test.subject || "MDCAT Test")}</strong>
          <p>${formatDate(test.createdAt)}</p>
        </div>

        <div>
          <strong>${test.correct || 0}/${test.total || 0}</strong>
          <p>${test.percentage || 0}%</p>
        </div>
      </div>
    `).join("");

  } catch (error) {
    console.error("Student history error:", error);
    historyContainer.innerHTML =
      "<p>Unable to load test history.</p>";
  }
}

/* =========================================================
   SUBJECT PERFORMANCE
========================================================= */

async function loadStudentSubjectPerformance(uid) {
  const container = $("studentSubjectPerformance");
  if (!container) return;

  try {
    const snapshot = await getDocs(
      collection(db, STUDENTS_COLLECTION, uid, "subjects")
    );

    if (snapshot.empty) {
      container.innerHTML = "<p>No subject performance available yet.</p>";
      return;
    }

    container.innerHTML = snapshot.docs.map(item => {
      const data = item.data();
      const percentage = data.total
        ? Math.round((data.correct / data.total) * 100)
        : 0;

      return `
        <div class="subject-performance-item">
          <strong>${escapeHTML(data.subject || item.id)}</strong>

          <span>${data.correct || 0}/${data.total || 0}</span>

          <div class="performance-track">
            <div style="width:${percentage}%"></div>
          </div>

          <small>${percentage}%</small>
        </div>
      `;
    }).join("");

  } catch (error) {
    console.error("Subject performance error:", error);
  }
}

/* =========================================================
   ADMIN DASHBOARD
========================================================= */

async function loadAdminData() {
  if (!isAdmin()) return;

  await loadQuestions();
  await loadSiteContent();
  await loadAdminStudents();
  await loadContributors();

  updateQuestionStats();
}

/* =========================================================
   ADMIN TABS
========================================================= */

document.querySelectorAll("[data-admin-tab]").forEach(button => {
  button.addEventListener("click", () => {
    const selectedTab = button.dataset.adminTab;

    document.querySelectorAll("[data-admin-tab]").forEach(tab => {
      tab.classList.toggle("active", tab === button);
    });

    document.querySelectorAll("[data-admin-panel]").forEach(panel => {
      panel.hidden = panel.dataset.adminPanel !== selectedTab;
    });

    if (selectedTab === "students") {
      loadAdminStudents();
    }

    if (selectedTab === "contributors") {
      loadContributors();
    }
  });
});

/* =========================================================
   ADMIN STUDENT REGISTRATION LIST
========================================================= */

async function loadAdminStudents() {
  if (!isAdmin()) return;

  const container = $("adminStudentsList");

  try {
    const snapshot = await getDocs(
      collection(db, STUDENTS_COLLECTION)
    );

    const students = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    if ($("adminTotalStudents")) {
      $("adminTotalStudents").textContent = students.length;
    }

    if ($("adminStudentCount")) {
      $("adminStudentCount").textContent = students.length;
    }

    if (!container) return;

    if (!students.length) {
      container.innerHTML = "<p>No student records found yet.</p>";
      return;
    }

    students.sort((a, b) => {
      const dateA = a.lastActive?.toMillis?.() || 0;
      const dateB = b.lastActive?.toMillis?.() || 0;
      return dateB - dateA;
    });

    container.innerHTML = students.map(student => `
      <div class="admin-item">
        <div>
          <strong>${escapeHTML(student.name || "Student")}</strong>
          <p>${escapeHTML(student.email || "")}</p>
          <small>UID: ${escapeHTML(student.uid || student.id)}</small>
        </div>

        <div>
          <p>Tests: ${Number(student.totalTests || 0)}</p>
          <p>MCQs: ${Number(student.totalAttempted || 0)}</p>
          <p>Correct: ${Number(student.totalCorrect || 0)}</p>
        </div>
      </div>
    `).join("");

  } catch (error) {
    console.error("Admin students error:", error);

    if (container) {
      container.innerHTML =
        "<p>Unable to load students. Check Firestore permissions.</p>";
    }
  }
}

/* =========================================================
   ADMIN QUESTION FORM
========================================================= */

function getQuestionFormData() {
  const question = $("questionText")?.value.trim();
  const subject = $("questionSubject")?.value;

  const options = [
    $("optionA")?.value.trim(),
    $("optionB")?.value.trim(),
    $("optionC")?.value.trim(),
    $("optionD")?.value.trim()
  ];

  const answer = Number($("correctAnswer")?.value);

  const explanation = $("questionExplanation")?.value.trim() || "";

  if (!question || !subject || options.some(option => !option)) {
    throw new Error("Please complete the question and all four options.");
  }

  if (!Number.isInteger(answer) || answer < 0 || answer > 3) {
    throw new Error("Please select a valid correct answer.");
  }

  return {
    question,
    subject,
    options,
    answer,
    explanation,
    updatedAt: serverTimestamp()
  };
}

function clearQuestionForm() {
  [
    "questionText",
    "optionA",
    "optionB",
    "optionC",
    "optionD",
    "questionExplanation"
  ].forEach(id => {
    if ($(id)) $(id).value = "";
  });

  if ($("questionSubject")) $("questionSubject").value = "Biology";
  if ($("correctAnswer")) $("correctAnswer").value = "0";

  editingQuestionId = null;

  if ($("saveQuestion")) {
    $("saveQuestion").textContent = "Add Question";
  }
}

$("saveQuestion")?.addEventListener("click", async () => {
  if (!isAdmin()) {
    alert("Admin access required.");
    return;
  }

  try {
    const data = getQuestionFormData();

    if (editingQuestionId) {
      await updateDoc(
        doc(db, QUESTIONS_COLLECTION, editingQuestionId),
        data
      );

      showMessage("questionStatus", "Question updated successfully.");

    } else {
      await addDoc(
        collection(db, QUESTIONS_COLLECTION),
        {
          ...data,
          createdAt: serverTimestamp()
        }
      );

      showMessage("questionStatus", "Question added successfully.");
    }

    clearQuestionForm();
    await loadQuestions();
    await renderAdminQuestions();

  } catch (error) {
    console.error("Save question error:", error);
    showMessage("questionStatus", error.message, true);
  }
});

$("clearQuestionForm")?.addEventListener("click", clearQuestionForm);

/* =========================================================
   ADMIN QUESTION LIST
========================================================= */

async function renderAdminQuestions() {
  if (!isAdmin()) return;

  const container = $("adminQuestionsList");
  if (!container) return;

  if (!allQuestions.length) {
    container.innerHTML = "<p>No questions available.</p>";
    return;
  }

  container.innerHTML = allQuestions.map(question => `
    <div class="admin-item">
      <div>
        <strong>${escapeHTML(question.subject || "Subject")}</strong>
        <p>${escapeHTML(question.question)}</p>
      </div>

      <div>
        <button
          type="button"
          class="btn"
          data-edit-question="${escapeHTML(question.id)}">
          Edit
        </button>

        <button
          type="button"
          class="btn"
          data-delete-question="${escapeHTML(question.id)}">
          Delete
        </button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll("[data-edit-question]").forEach(button => {
    button.addEventListener("click", () => {
      editAdminQuestion(button.dataset.editQuestion);
    });
  });

  container.querySelectorAll("[data-delete-question]").forEach(button => {
    button.addEventListener("click", () => {
      deleteAdminQuestion(button.dataset.deleteQuestion);
    });
  });
}

function editAdminQuestion(id) {
  if (!isAdmin()) return;

  const question = allQuestions.find(item => item.id === id);
  if (!question) return;

  editingQuestionId = id;

  if ($("questionText")) $("questionText").value = question.question || "";
  if ($("questionSubject")) $("questionSubject").value = question.subject || "Biology";

  ["optionA", "optionB", "optionC", "optionD"].forEach((field, index) => {
    if ($(field)) {
      $(field).value = question.options?.[index] || "";
    }
  });

  if ($("correctAnswer")) {
    $("correctAnswer").value = String(question.answer ?? 0);
  }

  if ($("questionExplanation")) {
    $("questionExplanation").value = question.explanation || "";
  }

  if ($("saveQuestion")) {
    $("saveQuestion").textContent = "Update Question";
  }

  $("questionForm")?.scrollIntoView({ behavior: "smooth" });
}

async function deleteAdminQuestion(id) {
  if (!isAdmin()) return;

  if (!confirm("Are you sure you want to delete this question?")) {
    return;
  }

  try {
    await deleteDoc(doc(db, QUESTIONS_COLLECTION, id));

    showMessage("questionStatus", "Question deleted.");

    await loadQuestions();
    await renderAdminQuestions();

  } catch (error) {
    console.error("Delete question error:", error);
    showMessage("questionStatus", "Could not delete question.", true);
  }
}

/* =========================================================
   CLOUDINARY GALLERY UPLOAD
========================================================= */

async function uploadGalleryImage(file, statusId) {
  if (!isAdmin()) {
    throw new Error("Admin access required.");
  }

  if (!file) {
    throw new Error("Please select an image from your Gallery.");
  }

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("Only JPG, PNG and WEBP images are allowed.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Image must be smaller than 5 MB.");
  }

  showMessage(statusId, "Uploading image...");

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

  const result = await response.json();

  if (!response.ok || !result.secure_url) {
    console.error("Cloudinary error:", result);
    throw new Error("Image upload failed. Check Cloudinary preset settings.");
  }

  showMessage(statusId, "Image uploaded successfully.");

  return result.secure_url;
}

/* =========================================================
   SAVE WEBSITE CONTENT
========================================================= */

async function saveSiteContent(key, data) {
  if (!isAdmin()) {
    throw new Error("Admin access required.");
  }

  await setDoc(
    doc(db, CONTENT_COLLECTION, key),
    {
      ...data,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

/* =========================================================
   ADMIN PHOTO UPLOAD
========================================================= */

$("uploadAdminPhoto")?.addEventListener("click", async () => {
  try {
    const file = $("contentAdminPhotoFile")?.files?.[0];

    const url = await uploadGalleryImage(
      file,
      "adminPhotoUploadStatus"
    );

    await saveSiteContent("main", {
      adminPhoto: url
    });

    if ($("adminProfilePhoto")) {
      $("adminProfilePhoto").src = url;
    }

    showMessage(
      "adminPhotoUploadStatus",
      "Admin profile photo saved."
    );

  } catch (error) {
    showMessage(
      "adminPhotoUploadStatus",
      error.message,
      true
    );
  }
});

/* =========================================================
   ANNOUNCEMENT POSTER UPLOAD
========================================================= */

$("uploadPoster")?.addEventListener("click", async () => {
  try {
    const file = $("contentPosterFile")?.files?.[0];

    const url = await uploadGalleryImage(
      file,
      "posterUploadStatus"
    );

    await saveSiteContent("main", {
      posterImage: url
    });

    showMessage(
      "posterUploadStatus",
      "Announcement poster saved."
    );

    await loadSiteContent();

  } catch (error) {
    showMessage("posterUploadStatus", error.message, true);
  }
});

/* =========================================================
   ADVERTISEMENT IMAGE UPLOAD
========================================================= */

$("uploadAd")?.addEventListener("click", async () => {
  try {
    const file = $("contentAdFile")?.files?.[0];

    const url = await uploadGalleryImage(
      file,
      "adUploadStatus"
    );

    await saveSiteContent("main", {
      adImage: url
    });

    showMessage(
      "adUploadStatus",
      "Advertisement image saved."
    );

    await loadSiteContent();

  } catch (error) {
    showMessage("adUploadStatus", error.message, true);
  }
});

/* =========================================================
   ANNOUNCEMENT TEXT SAVE
========================================================= */

$("saveAnnouncement")?.addEventListener("click", async () => {
  try {
    await saveSiteContent("main", {
      announcement: $("contentAnnouncement")?.value || "",
      announcementUrdu: $("contentAnnouncementUrdu")?.value || ""
    });

    showMessage("contentStatus", "Announcement saved.");
    await loadSiteContent();

  } catch (error) {
    showMessage("contentStatus", error.message, true);
  }
});

/* =========================================================
   LOAD WEBSITE CONTENT
========================================================= */

async function loadSiteContent() {
  try {
    const snapshot = await getDoc(
      doc(db, CONTENT_COLLECTION, "main")
    );

    if (!snapshot.exists()) return;

    siteContent = snapshot.data();

    if ($("contentAnnouncement")) {
      $("contentAnnouncement").value =
        siteContent.announcement || "";
    }

    if ($("contentAnnouncementUrdu")) {
      $("contentAnnouncementUrdu").value =
        siteContent.announcementUrdu || "";
    }

    if (siteContent.adminPhoto && $("adminProfilePhoto")) {
      $("adminProfilePhoto").src = siteContent.adminPhoto;
    }

    const poster = $("announcementPoster");

    if (poster && siteContent.posterImage) {
      poster.src = siteContent.posterImage;
      poster.hidden = false;
    }

    const ad = $("advertisementImage");

    if (ad && siteContent.adImage) {
      ad.src = siteContent.adImage;
      ad.hidden = false;
    }

    const announcement = $("announcementText");

    if (announcement && siteContent.announcement) {
      announcement.textContent = siteContent.announcement;
    }

    const announcementUrdu = $("announcementUrdu");

    if (announcementUrdu && siteContent.announcementUrdu) {
      announcementUrdu.textContent = siteContent.announcementUrdu;
    }

  } catch (error) {
    console.error("Site content error:", error);
  }
}

/* =========================================================
   CONTRIBUTORS
========================================================= */

async function loadContributors() {
  if (!isAdmin()) return;

  const container = $("adminContributorsList");
  if (!container) return;

  try {
    const snapshot = await getDocs(
      collection(db, CONTRIBUTORS_COLLECTION)
    );

    if (snapshot.empty) {
      container.innerHTML = "<p>No contributors added yet.</p>";
      return;
    }

    container.innerHTML = snapshot.docs.map(item => `
      <div class="admin-item">
        <div>
          <strong>${escapeHTML(item.data().email || item.id)}</strong>
          <p>${escapeHTML(item.data().name || "Contributor")}</p>
        </div>

        <button
          class="btn"
          type="button"
          data-remove-contributor="${escapeHTML(item.id)}">
          Remove
        </button>
      </div>
    `).join("");

    container.querySelectorAll("[data-remove-contributor]").forEach(button => {
      button.addEventListener("click", async () => {
        if (!confirm("Remove this contributor?")) return;

        try {
          await deleteDoc(
            doc(db, CONTRIBUTORS_COLLECTION, button.dataset.removeContributor)
          );

          await loadContributors();

        } catch (error) {
          console.error(error);
          showMessage("contributorStatus", "Unable to remove contributor.", true);
        }
      });
    });

  } catch (error) {
    console.error("Contributor loading error:", error);
    showMessage("contributorStatus", "Unable to load contributors.", true);
  }
}

$("addContributor")?.addEventListener("click", async () => {
  if (!isAdmin()) return;

  const email = $("contributorEmail")?.value.trim().toLowerCase();

  if (!email || !email.includes("@")) {
    showMessage("contributorStatus", "Enter a valid email address.", true);
    return;
  }

  try {
    await setDoc(
      doc(db, CONTRIBUTORS_COLLECTION, email),
      {
        email,
        name: $("contributorName")?.value.trim() || "",
        createdAt: serverTimestamp(),
        addedBy: currentUser.uid
      }
    );

    if ($("contributorEmail")) $("contributorEmail").value = "";
    if ($("contributorName")) $("contributorName").value = "";

    showMessage("contributorStatus", "Contributor added successfully.");

    await loadContributors();

  } catch (error) {
    console.error("Add contributor error:", error);
    showMessage("contributorStatus", "Unable to add contributor.", true);
  }
});

/* =========================================================
   LANGUAGE SWITCH
========================================================= */

$("languageToggle")?.addEventListener("click", () => {
  currentLanguage = currentLanguage === "en" ? "ur" : "en";

  document.documentElement.lang = currentLanguage;

  document.documentElement.dir =
    currentLanguage === "ur" ? "rtl" : "ltr";

  $("languageToggle").textContent =
    currentLanguage === "ur" ? "English" : "اردو";

  document.querySelectorAll("[data-en][data-ur]").forEach(element => {
    element.textContent =
      element.dataset[currentLanguage];
  });
});

/* =========================================================
   APPLICATION INITIALIZATION
========================================================= */

async function initializeApplication() {
  await loadQuestions();

  if (isAdmin()) {
    await loadAdminData();
    await renderAdminQuestions();
  }
}

initializeApplication().catch(error => {
  console.error("Application initialization error:", error);
});

/* =========================================================
   CHEMPHYBIO MDCAT — APPLICATION COMPLETE
========================================================= */
