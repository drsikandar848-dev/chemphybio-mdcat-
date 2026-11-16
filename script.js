
/* =========================================================
   CHEMPHYBIO MDCAT — MAIN APPLICATION
   Firebase | Google Login | Student Dashboard
   Practice | Timed Tests | Admin Dashboard
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
   IMPORTANT ADMIN SETTING
   Preserve your existing Admin UID from your old script.js.
   Never share your UID or password publicly.
========================================================= */

const ADMIN_UID = "JIiL8pKKWQbzNJuUR9mvrp0tGhr1";

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

const $ = (id) => document.getElementById(id);

function showMessage(id, message, isError = false) {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.style.color = isError ? "#ff8a8a" : "#52d6ee";
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

  if (Number.isNaN(date.getTime())) return "Recently";

  return date.toLocaleDateString();
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
    button.textContent = button.dataset.originalText || button.textContent;
  }
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

    if (error.code === "auth/popup-closed-by-user") {
      message = "Login window closed. Please try again.";
    } else if (error.code === "auth/unauthorized-domain") {
      message = "This website domain is not authorized in Firebase.";
    } else if (error.code === "auth/popup-blocked") {
      message = "Allow popups for this website and try again.";
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

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (!user) {
    showStudentLoggedOut();
    showAdminLoggedOut();
    return;
  }

  await loadStudentDashboard(user);

  if (ADMIN_UID && ADMIN_UID !== "PASTE_YOUR_EXISTING_ADMIN_UID_HERE" && user.uid === ADMIN_UID) {
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
    $("adminDisplayName").textContent = user.displayName || "Administrator";
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
    const snapshot = await getDocs(collection(db, QUESTIONS_COLLECTION));

    allQuestions = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    })).filter(question =>
      question.question &&
      Array.isArray(question.options) &&
      question.options.length === 4 &&
      Number.isInteger(Number(question.answer))
    );

    updateSubjectCounts();
    updateQuestionStats();

  } catch (error) {
    console.error("Question loading error:", error);
    showMessage("mockStatus", "Unable to load questions. Check your internet or Firestore rules.", true);
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

  Object.entries(subjects).forEach(([subject, elementId]) => {
    const count = allQuestions.filter(q => q.subject === subject).length;

    if ($(elementId)) {
      $(elementId).textContent = `${count} MCQs`;
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
  const available = allQuestions.filter(q => q.subject === subject);

  if (!available.length) {
    $("quizArea").innerHTML = `
      <div class="quiz-result">
        No questions are currently available for ${escapeHTML(subject)}.
      </div>`;
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
        <button class="quiz-option" data-quick-option="${index}">
          ${String.fromCharCode(65 + index)}. ${escapeHTML(option)}
        </button>
      `).join("")}

      <div id="quickFeedback" class="quiz-feedback"></div>
      <button class="btn" id="quickNext" type="button" disabled>
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
    $("quickFeedback").textContent += ` Explanation: ${question.explanation}`;
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
      <p>Correct Answers: ${currentQuizScore} / ${currentQuiz.length}</p>
      <h2>${percentage}%</h2>
      <button class="btn" id="practiceAgain" type="button">Practice Again</button>
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
   TIMED TEST SYSTEM
========================================================= */

$("startFullTest")?.addEventListener("click", () => {
  const subject = $("testSubject")?.value || "All";
  const count = Number($("testQuestionCount")?.value || 180);

  startTest(subject, count);
});

function startTest(subject, requestedCount) {
  const available = subject === "All"
    ? allQuestions
    : allQuestions.filter(q => q.subject === subject);

  if (!available.length) {
    showMessage("mockStatus", "No MCQs are available for this test yet.", true);
    return;
  }

  testQuestions = shuffleArray(available).slice(0, requestedCount);

  testAnswers = new Array(testQuestions.length).fill(null);
  testReview = new Array(testQuestions.length).fill(false);
  testCurrentIndex = 0;
  testFinished = false;
  testStartedAt = new Date();
  activeTestSubject = subject;

  // One minute per question as a practice timer.
  testSecondsRemaining = testQuestions.length * 60;

  $("mainWebsite")?.setAttribute("hidden", "");
  $("testResultScreen")?.setAttribute("hidden", "");
  $("testEnvironment")?.removeAttribute("hidden");

  if ($("testSubjectTitle")) {
    $("testSubjectTitle").textContent =
      subject === "All" ? "Full MDCAT Mock Test" : `${subject} Test`;
  }

  if (testQuestions.length < requestedCount) {
    showMessage(
      "mockStatus",
      `Only ${testQuestions.length} questions are currently available. This test will use the available questions.`
    );
  }

  renderTestQuestion();
  renderQuestionNavigator();
  updateTestProgress();
  startTestTimer();
}

function startTestTimer() {
  clearInterval(testInterval);

  updateTimerDisplay();

  testInterval = setInterval(() => {
    testSecondsRemaining--;

    updateTimerDisplay();

    if (testSecondsRemaining <= 0) {
      clearInterval(testInterval);
      finishTest(true);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const minutes = Math.floor(testSecondsRemaining / 60);
  const seconds = testSecondsRemaining % 60;

  if ($("testTimer")) {
    $("testTimer").textContent =
      `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  if ($("testTimer")) {
    $("testTimer").style.color =
      testSecondsRemaining <= 60 ? "#ff7272" : "#52d6ee";
  }
}

function renderTestQuestion() {
  const question = testQuestions[testCurrentIndex];

  if (!question) return;

  $("testQuestionNumber").textContent =
    `QUESTION ${String(testCurrentIndex + 1).padStart(2, "0")}`;

  $("testQuestionChapter").textContent = question.chapter || "General";

  $("testQuestionText").textContent = question.question;

  $("testOptions").innerHTML = question.options.map((option, index) => `
    <button
      class="test-option ${testAnswers[testCurrentIndex] === index ? "selected" : ""}"
      data-test-option="${index}"
      type="button">
      <span class="test-option-letter">${String.fromCharCode(65 + index)}</span>
      <span>${escapeHTML(option)}</span>
    </button>
  `).join("");

  document.querySelectorAll("[data-test-option]").forEach(button => {
    button.addEventListener("click", () => {
      const selected = Number(button.dataset.testOption);

      testAnswers[testCurrentIndex] = selected;

      renderTestQuestion();
      renderQuestionNavigator();
      updateTestProgress();
    });
  });

  $("testPrevious").disabled = testCurrentIndex === 0;

  $("testNext").textContent =
    testCurrentIndex === testQuestions.length - 1 ? "Finish →" : "Next →";

  $("markForReview").textContent =
    testReview[testCurrentIndex]
      ? "★ Remove Review Mark"
      : "☆ Mark for Review";
}

function renderQuestionNavigator() {
  if (!$("questionNavigator")) return;

  $("questionNavigator").innerHTML = testQuestions.map((question, index) => {
    let status = "";

    if (testAnswers[index] !== null) status = "answered";
    if (testReview[index]) status = "review";

    if (index === testCurrentIndex) status += " current";

    return `
      <button
        type="button"
        class="navigator-question ${status}"
        data-jump-question="${index}">
        ${index + 1}
      </button>
    `;
  }).join("");

  document.querySelectorAll("[data-jump-question]").forEach(button => {
    button.addEventListener("click", () => {
      testCurrentIndex = Number(button.dataset.jumpQuestion);
      renderTestQuestion();
      renderQuestionNavigator();
      updateTestProgress();
    });
  });
}

function updateTestProgress() {
  const answered = testAnswers.filter(answer => answer !== null).length;
  const total = testQuestions.length;
  const percentage = total ? (answered / total) * 100 : 0;

  if ($("testProgressText")) {
    $("testProgressText").textContent =
      `Question ${testCurrentIndex + 1} of ${total}`;
  }

  if ($("testAnsweredText")) {
    $("testAnsweredText").textContent = `Answered: ${answered}`;
  }

  if ($("testProgressBar")) {
    $("testProgressBar").style.width = `${percentage}%`;
  }
}

$("testPrevious")?.addEventListener("click", () => {
  if (testCurrentIndex <= 0) return;

  testCurrentIndex--;
  renderTestQuestion();
  renderQuestionNavigator();
  updateTestProgress();
});

$("testNext")?.addEventListener("click", () => {
  if (testCurrentIndex < testQuestions.length - 1) {
    testCurrentIndex++;
    renderTestQuestion();
    renderQuestionNavigator();
    updateTestProgress();
  } else {
    finishTest(false);
  }
});

$("testSkip")?.addEventListener("click", () => {
  if (testCurrentIndex < testQuestions.length - 1) {
    testCurrentIndex++;
  } else {
    testCurrentIndex = 0;
  }

  renderTestQuestion();
  renderQuestionNavigator();
  updateTestProgress();
});

$("markForReview")?.addEventListener("click", () => {
  testReview[testCurrentIndex] = !testReview[testCurrentIndex];

  renderTestQuestion();
  renderQuestionNavigator();
});

$("submitTest")?.addEventListener("click", () => {
  const unanswered = testAnswers.filter(answer => answer === null).length;

  const confirmation = unanswered
    ? `You have ${unanswered} unanswered questions. Submit your test?`
    : "Are you sure you want to submit your test?";

  if (confirm(confirmation)) {
    finishTest(false);
  }
});

$("exitTest")?.addEventListener("click", () => {
  if (confirm("Exit this test? Your current answers will not be saved as a completed test.")) {
    clearInterval(testInterval);

    $("testEnvironment")?.setAttribute("hidden", "");
    $("mainWebsite")?.removeAttribute("hidden");
  }
});

/* =========================================================
   TEST RESULTS AND REVIEW
========================================================= */

async function finishTest(timeExpired = false) {
  if (testFinished) return;

  testFinished = true;
  clearInterval(testInterval);

  let correct = 0;
  let wrong = 0;
  let unattempted = 0;

  testQuestions.forEach((question, index) => {
    if (testAnswers[index] === null) {
      unattempted++;
    } else if (testAnswers[index] === Number(question.answer)) {
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
    Math.floor((Date.now() - testStartedAt.getTime()) / 1000)
  );

  const result = {
    subject: activeTestSubject,
    total,
    correct,
    wrong,
    unattempted,
    percentage,
    durationSeconds,
    completedAt: new Date()
  };

  $("testEnvironment")?.setAttribute("hidden", "");
  $("testResultScreen")?.removeAttribute("hidden");

  $("resultPercentage").textContent = `${percentage}%`;
  $("resultTotal").textContent = total;
  $("resultCorrect").textContent = correct;
  $("resultWrong").textContent = wrong;
  $("resultUnattempted").textContent = unattempted;

  $("resultMessage").textContent = timeExpired
    ? "Time is over. Your test has been submitted automatically."
    : "Your test has been submitted successfully.";

  renderAnswerReview();

  if (currentUser && ADMIN_UID !== currentUser.uid) {
    await saveStudentTest(result);
  }

  if (currentUser && ADMIN_UID === currentUser.uid) {
    // Admin test attempts are not stored as student results.
  }
}

function renderAnswerReview() {
  $("resultAnswerReview").innerHTML = testQuestions.map((question, index) => {
    const selected = testAnswers[index];
    const correct = Number(question.answer);

    let status = "Unattempted";

    if (selected !== null) {
      status = selected === correct ? "Correct" : "Incorrect";
    }

    return `
      <div class="answer-review-item">
        <strong>Q${index + 1}. ${escapeHTML(question.question)}</strong>
        <p>Status: ${status}</p>
        <p>Your answer: ${
          selected === null
            ? "Not attempted"
            : escapeHTML(question.options[selected])
        }</p>
        <p>Correct answer: ${escapeHTML(question.options[correct])}</p>
        ${question.explanation
          ? `<p>Explanation: ${escapeHTML(question.explanation)}</p>`
          : ""}
      </div>
    `;
  }).join("");
}

$("reviewAnswers")?.addEventListener("click", () => {
  const review = $("resultAnswerReview");

  review.hidden = !review.hidden;

  $("reviewAnswers").textContent =
    review.hidden ? "Review Answers" : "Hide Answer Review";
});

$("backToWebsite")?.addEventListener("click", () => {
  $("testResultScreen")?.setAttribute("hidden", "");
  $("mainWebsite")?.removeAttribute("hidden");

  $("mockTests")?.scrollIntoView({ behavior: "smooth" });
});

/* =========================================================
   STUDENT DATA STORAGE
   Each student uses their own UID document.
   Test attempts are stored in a subcollection.
========================================================= */

async function saveStudentTest(result) {
  if (!currentUser) return;

  try {
    const studentRef = doc(
      db,
      STUDENTS_COLLECTION,
      currentUser.uid
    );

    const testRef = collection(
      db,
      STUDENTS_COLLECTION,
      currentUser.uid,
      "tests"
    );

    const subjectStatsRef = doc(
      db,
      STUDENTS_COLLECTION,
      currentUser.uid,
      "subjects",
      safeDocumentId(result.subject)
    );

    const existingStudent = await getDoc(studentRef);

    const oldData = existingStudent.exists()
      ? existingStudent.data()
      : {};

    const oldTests = Number(oldData.totalTests || 0);
    const oldAttempted = Number(oldData.totalAttempted || 0);
    const oldCorrect = Number(oldData.totalCorrect || 0);

    const attempted = result.total - result.unattempted;

    await addDoc(testRef, {
      ...result,
      createdAt: serverTimestamp()
    });

    await setDoc(studentRef, {
      uid: currentUser.uid,
      name: currentUser.displayName || "Student",
      email: currentUser.email || "",
      photoURL: currentUser.photoURL || "",
      totalTests: oldTests + 1,
      totalAttempted: oldAttempted + attempted,
      totalCorrect: oldCorrect + result.correct,
      updatedAt: serverTimestamp()
    }, { merge: true });

    const oldSubjectSnapshot = await getDoc(subjectStatsRef);
    const oldSubject = oldSubjectSnapshot.exists()
      ? oldSubjectSnapshot.data()
      : {};

    await setDoc(subjectStatsRef, {
      subject: result.subject,
      totalTests: Number(oldSubject.totalTests || 0) + 1,
      attempted: Number(oldSubject.attempted || 0) + attempted,
      correct: Number(oldSubject.correct || 0) + result.correct,
      updatedAt: serverTimestamp()
    }, { merge: true });

    await loadStudentDashboard(currentUser);

  } catch (error) {
    console.error("Student progress save error:", error);

    showMessage(
      "studentAuthMessage",
      "Test completed, but progress could not be saved. Firestore student rules may need updating.",
      true
    );
  }
}

function safeDocumentId(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_");
}

/* =========================================================
   STUDENT DASHBOARD
========================================================= */

async function loadStudentDashboard(user) {
  if (!user) {
    showStudentLoggedOut();
    return;
  }

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
    $("studentPhoto").onerror = () => {
      $("studentPhoto").src =
        "https://www.gravatar.com/avatar/?d=mp&s=120";
    };
  }

  try {
    const studentRef = doc(db, STUDENTS_COLLECTION, user.uid);
    const studentSnapshot = await getDoc(studentRef);

    const data = studentSnapshot.exists()
      ? studentSnapshot.data()
      : {};

    const totalTests = Number(data.totalTests || 0);
    const totalAttempted = Number(data.totalAttempted || 0);
    const totalCorrect = Number(data.totalCorrect || 0);

    const average = totalAttempted
      ? Math.round((totalCorrect / totalAttempted) * 100)
      : 0;

    const estimated = Math.round((average / 100) * 180);

    $("studentTotalTests").textContent = totalTests;
    $("studentAverage").textContent = `${average}%`;
    $("studentAttempted").textContent = totalAttempted;
    $("studentEstimatedScore").textContent =
      totalTests ? `${estimated} / 180` : "— / 180";

    const subjectsSnapshot = await getDocs(
      collection(db, STUDENTS_COLLECTION, user.uid, "subjects")
    );

    const subjectData = subjectsSnapshot.docs.map(item => item.data());

    renderSubjectPerformance(subjectData);

    const testsQuery = query(
      collection(db, STUDENTS_COLLECTION, user.uid, "tests"),
      orderBy("createdAt", "desc"),
      limit(30)
    );

    const testsSnapshot = await getDocs(testsQuery);

    studentTestHistory = testsSnapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    renderStudentHistory();

  } catch (error) {
    console.error("Student dashboard error:", error);

    showMessage(
      "studentAuthMessage",
      "Dashboard data is not available yet. Check Firestore rules.",
      true
    );
  }
}

function renderSubjectPerformance(subjects) {
  const container = $("subjectPerformance");
  if (!container) return;

  const names = [
    "Biology",
    "Chemistry",
    "Physics",
    "English",
    "Logical Reasoning"
  ];

  container.innerHTML = names.map(name => {
    const subject = subjects.find(item => item.subject === name);

    const attempted = Number(subject?.attempted || 0);
    const correct = Number(subject?.correct || 0);

    const percentage = attempted
      ? Math.round((correct / attempted) * 100)
      : 0;

    return `
      <div class="performance-row">
        <div class="performance-row-top">
          <strong>${escapeHTML(name)}</strong>
          <span>${percentage}% · ${attempted} attempted</span>
        </div>
        <div class="performance-track">
          <div class="performance-fill" style="width:${percentage}%"></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderStudentHistory() {
  const container = $("studentTestHistory");
  if (!container) return;

  if (!studentTestHistory.length) {
    container.innerHTML = "<p>No completed tests yet. Start your first test!</p>";
    return;
  }

  container.innerHTML = studentTestHistory.map(test => `
    <div class="history-item">
      <div>
        <strong>${escapeHTML(test.subject || "Test")}</strong>
        <br>
        <span>${formatDate(test.completedAt || test.createdAt)}</span>
      </div>
      <div>
        <strong>${Number(test.percentage || 0)}%</strong>
        <br>
        <span>${Number(test.correct || 0)} / ${Number(test.total || 0)} correct</span>
      </div>
    </div>
  `).join("");
}

/* =========================================================
   ADMIN QUESTION MANAGEMENT
========================================================= */

function isAdmin() {
  return Boolean(
    currentUser &&
    ADMIN_UID &&
    ADMIN_UID !== "PASTE_YOUR_EXISTING_ADMIN_UID_HERE" &&
    currentUser.uid === ADMIN_UID
  );
}

async function loadAdminData() {
  if (!isAdmin()) return;

  await loadAdminQuestions();
  await loadContributors();
}

async function loadAdminQuestions() {
  if (!isAdmin()) return;

  const container = $("adminMcqList");
  if (!container) return;

  container.innerHTML = "<p>Loading questions...</p>";

  try {
    const snapshot = await getDocs(
      collection(db, QUESTIONS_COLLECTION)
    );

    const questions = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    container.innerHTML = questions.length
      ? questions.map(question => `
          <div class="admin-item">
            <strong>${escapeHTML(question.subject || "Subject")}</strong>
            <p>${escapeHTML(question.chapter || "General")}</p>
            <p>${escapeHTML(question.question || "")}</p>

            <button
              class="btn btn-secondary"
              data-edit-question="${question.id}"
              type="button">
              Edit
            </button>

            <button
              class="btn btn-danger"
              data-delete-question="${question.id}"
              type="button">
              Delete
            </button>
          </div>
        `).join("")
      : "<p>No questions found.</p>";

    document.querySelectorAll("[data-edit-question]").forEach(button => {
      button.addEventListener("click", () => {
        const question = questions.find(
          item => item.id === button.dataset.editQuestion
        );

        if (question) editQuestion(question);
      });
    });

    document.querySelectorAll("[data-delete-question]").forEach(button => {
      button.addEventListener("click", () => {
        deleteQuestion(button.dataset.deleteQuestion);
      });
    });

    $("adminTotalQuestions").textContent = questions.length;

  } catch (error) {
    console.error(error);
    showMessage("adminStatus", "Unable to load admin questions.", true);
  }
}

function editQuestion(question) {
  editingQuestionId = question.id;

  $("mcqSubject").value = question.subject || "Biology";
  $("mcqChapter").value = question.chapter || "";
  $("mcqQuestion").value = question.question || "";

  question.options.forEach((option, index) => {
    $(`mcqOption${index}`).value = option || "";
  });

  $("mcqAnswer").value = String(question.answer ?? 0);
  $("mcqExplanation").value = question.explanation || "";

  $("saveMcq").textContent = "Update Question";
  $("cancelEdit").hidden = false;

  $("mcqForm").scrollIntoView({ behavior: "smooth" });
}

function resetQuestionForm() {
  editingQuestionId = null;
  $("mcqForm")?.reset();

  $("saveMcq").textContent = "Save Question";
  $("cancelEdit").hidden = true;
}

$("cancelEdit")?.addEventListener("click", resetQuestionForm);

$("mcqForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!isAdmin()) {
    showMessage("adminStatus", "Administrator access required.", true);
    return;
  }

  const questionData = {
    subject: $("mcqSubject").value,
    chapter: $("mcqChapter").value.trim(),
    question: $("mcqQuestion").value.trim(),
    options: [
      $("mcqOption0").value.trim(),
      $("mcqOption1").value.trim(),
      $("mcqOption2").value.trim(),
      $("mcqOption3").value.trim()
    ],
    answer: Number($("mcqAnswer").value),
    explanation: $("mcqExplanation").value.trim(),
    updatedAt: serverTimestamp()
  };

  if (
    !questionData.question ||
    !questionData.chapter ||
    questionData.options.some(option => !option)
  ) {
    showMessage("adminStatus", "Please complete all question fields.", true);
    return;
  }

  try {
    if (editingQuestionId) {
      await updateDoc(
        doc(db, QUESTIONS_COLLECTION, editingQuestionId),
        questionData
      );

      showMessage("adminStatus", "Question updated successfully.");
    } else {
      questionData.createdAt = serverTimestamp();

      await addDoc(
        collection(db, QUESTIONS_COLLECTION),
        questionData
      );

      showMessage("adminStatus", "New question added successfully.");
    }

    resetQuestionForm();

    await loadQuestions();
    await loadAdminQuestions();

  } catch (error) {
    console.error(error);
    showMessage("adminStatus", "Unable to save question. Check Firestore permissions.", true);
  }
});

async function deleteQuestion(id) {
  if (!isAdmin()) return;

  if (!confirm("Delete this question permanently?")) return;

  try {
    await deleteDoc(doc(db, QUESTIONS_COLLECTION, id));

    showMessage("adminStatus", "Question deleted.");

    await loadQuestions();
    await loadAdminQuestions();

  } catch (error) {
    console.error(error);
    showMessage("adminStatus", "Unable to delete question.", true);
  }
}

/* =========================================================
   ADMIN CONTENT MANAGEMENT
========================================================= */

async function loadSiteContent() {
  try {
    const contentRef = doc(db, CONTENT_COLLECTION, "main");
    const snapshot = await getDoc(contentRef);

    if (!snapshot.exists()) return;

    siteContent = snapshot.data();

    renderPublicContent();
    fillAdminContent();
    showAnnouncementSplash();

  } catch (error) {
    console.error("Content loading error:", error);
  }
}

function renderPublicContent() {
  if ($("adminPublicName")) {
    $("adminPublicName").textContent =
      siteContent.adminName || "CHEMPHYBIO MDCAT Team";
  }

  if ($("welcomeMessage")) {
    $("welcomeMessage").textContent =
      siteContent.welcomeMessage ||
      "Our mission is to make quality MDCAT preparation accessible to every student.";
  }

  if ($("adminPublicPhoto")) {
    if (siteContent.adminPhoto) {
      $("adminPublicPhoto").src = siteContent.adminPhoto;
      $("adminPublicPhoto").hidden = false;
    } else {
      $("adminPublicPhoto").hidden = true;
    }
  }

  if ($("whatsappCommunity")) {
    if (siteContent.whatsapp) {
      $("whatsappCommunity").href = siteContent.whatsapp;
      $("whatsappCommunity").hidden = false;
    } else {
      $("whatsappCommunity").hidden = true;
    }
  }

  if ($("posterCard")) {
    const poster = siteContent.poster || "";

    $("posterCard").hidden = !poster;

    if (poster) {
      $("posterImage").src = poster;
      $("posterTitle").textContent =
        siteContent.posterTitle || "Latest Announcement";
    }
  }

  if ($("advertisementCard")) {
    const advertisement = siteContent.advertisement || "";

    $("advertisementCard").hidden = !advertisement;

    if (advertisement) {
      $("advertisementImage").src = advertisement;
      $("advertisementTitle").textContent =
        siteContent.adTitle || "Advertisement";
    }
  }

  renderUpdates();
}

function renderUpdates() {
  const container = $("updatesList");
  if (!container) return;

  const updates = Array.isArray(siteContent.updates)
    ? siteContent.updates
    : [];

  container.innerHTML = updates.map(update => `
    <article class="update-card">
      <h3>${escapeHTML(update.title || "Update")}</h3>
      <p>${escapeHTML(update.message || "")}</p>
    </article>
  `).join("");
}

function fillAdminContent() {
  if (!isAdmin()) return;

  $("contentAdminName").value = siteContent.adminName || "";
  $("contentAdminPhoto").value = siteContent.adminPhoto || "";
  $("contentWelcome").value = siteContent.welcomeMessage || "";
  $("contentWhatsapp").value = siteContent.whatsapp || "";
  $("contentPosterTitle").value = siteContent.posterTitle || "";
  $("contentPoster").value = siteContent.poster || "";
  $("contentAnnouncement").value = siteContent.announcement || "";
  $("contentAdTitle").value = siteContent.adTitle || "";
  $("contentAd").value = siteContent.advertisement || "";
}

$("adminContentForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!isAdmin()) return;

  const button = $("saveSiteContent");
  setButtonLoading(button, true, "Publishing...");

  const content = {
    adminName: $("contentAdminName").value.trim(),
    adminPhoto: $("contentAdminPhoto").value.trim(),
    welcomeMessage: $("contentWelcome").value.trim(),
    whatsapp: $("contentWhatsapp").value.trim(),
    posterTitle: $("contentPosterTitle").value.trim(),
    poster: $("contentPoster").value.trim(),
    announcement: $("contentAnnouncement").value.trim(),
    adTitle: $("contentAdTitle").value.trim(),
    advertisement: $("contentAd").value.trim(),
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(
      doc(db, CONTENT_COLLECTION, "main"),
      content,
      { merge: true }
    );

    siteContent = {
      ...siteContent,
      ...content
    };

    renderPublicContent();
    showAnnouncementSplash();

    showMessage("adminStatus", "Website content published successfully.");

  } catch (error) {
    console.error(error);
    showMessage("adminStatus", "Unable to publish content. Check Firestore permissions.", true);
  } finally {
    setButtonLoading(button, false);
  }
});

/* =========================================================
   ANNOUNCEMENT SPLASH
========================================================= */

function showAnnouncementSplash() {
  const splash = $("announcementSplash");

  if (!splash) return;

  const message = siteContent.announcement || "";
  const poster = siteContent.poster || "";
  const title = siteContent.posterTitle || "Latest Announcement";

  if (!message && !poster) {
    splash.hidden = true;
    return;
  }

  $("splashTitle").textContent = title;
  $("splashMessage").textContent = message;

  if (poster) {
    $("splashImage").src = poster;
    $("splashImage").hidden = false;
  } else {
    $("splashImage").hidden = true;
  }

  splash.hidden = false;

  setTimeout(() => {
    splash.hidden = true;
  }, 3000);
}

/* =========================================================
   CONTRIBUTORS
========================================================= */

async function loadContributors() {
  if (!isAdmin()) return;

  try {
    const snapshot = await getDocs(
      collection(db, CONTRIBUTORS_COLLECTION)
    );

    const contributors = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    $("adminTotalContributors").textContent = contributors.length;

    $("contributorsList").innerHTML = contributors.length
      ? contributors.map(item => `
          <div class="admin-item">
            <strong>${escapeHTML(item.email || "Contributor")}</strong>
            <button
              class="btn btn-danger"
              type="button"
              data-remove-contributor="${item.id}">
              Remove
            </button>
          </div>
        `).join("")
      : "<p>No contributors added.</p>";

    document.querySelectorAll("[data-remove-contributor]").forEach(button => {
      button.addEventListener("click", () => {
        removeContributor(button.dataset.removeContributor);
      });
    });

  } catch (error) {
    console.error(error);
    showMessage("adminStatus", "Unable to load contributors.", true);
  }
}

$("addContributor")?.addEventListener("click", async () => {
  if (!isAdmin()) return;

  const email = $("contributorEmail").value.trim().toLowerCase();

  if (!email || !email.includes("@")) {
    showMessage("adminStatus", "Enter a valid email address.", true);
    return;
  }

  try {
    await addDoc(collection(db, CONTRIBUTORS_COLLECTION), {
      email,
      createdAt: serverTimestamp()
    });

    $("contributorEmail").value = "";

    showMessage("adminStatus", "Contributor added.");
    await loadContributors();

  } catch (error) {
    console.error(error);
    showMessage("adminStatus", "Unable to add contributor.", true);
  }
});

async function removeContributor(id) {
  if (!isAdmin()) return;

  if (!confirm("Remove this contributor?")) return;

  try {
    await deleteDoc(doc(db, CONTRIBUTORS_COLLECTION, id));

    showMessage("adminStatus", "Contributor removed.");
    await loadContributors();

  } catch (error) {
    console.error(error);
    showMessage("adminStatus", "Unable to remove contributor.", true);
  }
}

/* =========================================================
   ADMIN TABS
========================================================= */

document.querySelectorAll("[data-admin-tab]").forEach(button => {
  button.addEventListener("click", () => {
    const selected = button.dataset.adminTab;

    document.querySelectorAll("[data-admin-tab]").forEach(tab => {
      tab.classList.toggle("active", tab === button);
    });

    const panels = {
      questions: "adminQuestionsPanel",
      content: "adminContentPanel",
      contributors: "adminContributorsPanel"
    };

    Object.entries(panels).forEach(([key, id]) => {
      const panel = $(id);

      if (!panel) return;

      panel.hidden = key !== selected;
      panel.classList.toggle("active", key === selected);
    });

    if (selected === "content") {
      fillAdminContent();
    }

    if (selected === "contributors") {
      loadContributors();
    }
  });
});

/* =========================================================
   AGGREGATE CALCULATOR
   Illustrative weightage: Matric 10%, FSc 40%, MDCAT 50%.
   Confirm official weightage separately.
========================================================= */

$("calculateAggregate")?.addEventListener("click", calculateAggregate);

function calculateAggregate() {
  const matric = Number($("matricMarks").value);
  const matricTotal = Number($("matricTotal").value);

  const fsc = Number($("fscMarks").value);
  const fscTotal = Number($("fscTotal").value);

  const mdcat = Number($("mdcatMarks").value);
  const mdcatTotal = Number($("mdcatTotal").value);

  const valid =
    matricTotal > 0 &&
    fscTotal > 0 &&
    mdcatTotal > 0 &&
    matric >= 0 &&
    fsc >= 0 &&
    mdcat >= 0 &&
    matric <= matricTotal &&
    fsc <= fscTotal &&
    mdcat <= mdcatTotal;

  if (!valid) {
    $("aggregateResult").innerHTML =
      "<p>Please enter valid marks and totals.</p>";
    return;
  }

  const aggregate =
    (matric / matricTotal) * 10 +
    (fsc / fscTotal) * 40 +
    (mdcat / mdcatTotal) * 50;

  $("aggregateResult").innerHTML = `
    <p>Your Illustrative Aggregate</p>
    <strong>${aggregate.toFixed(2)}%</strong>
    <small>Weightage used: Matric 10% · FSc 40% · MDCAT 50%</small>
  `;
}

/* =========================================================
   LANGUAGE TOGGLE
========================================================= */

const translations = {
  en: {
    home: "Home",
    subjects: "Subjects",
    practice: "Practice",
    mockTests: "Mock Tests",
    updates: "Updates",
    about: "About"
  },
  ur: {
    home: "صفحہ اول",
    subjects: "مضامین",
    practice: "مشق",
    mockTests: "ٹیسٹ",
    updates: "تازہ خبریں",
    about: "تعارف"
  }
};

function setupLanguage() {
  const saved = localStorage.getItem("chemphybio-language");

  currentLanguage = saved === "ur" ? "ur" : "en";

  applyLanguage();
}

function applyLanguage() {
  document.body.classList.toggle("lang-ur", currentLanguage === "ur");
  document.documentElement.lang = currentLanguage;

  if ($("languageToggle")) {
    $("languageToggle").textContent =
      currentLanguage === "en" ? "اردو" : "English";
  }

  const nav = document.querySelectorAll(".nav-links a");

  const keys = [
    "home",
    "subjects",
    "practice",
    "mockTests",
    "updates",
    "about"
  ];

  nav.forEach(link => {
    const href = link.getAttribute("href")?.replace("#", "");

    if (translations[currentLanguage][href]) {
      link.textContent = translations[currentLanguage][href];
    }
  });
}

$("languageToggle")?.addEventListener("click", () => {
  currentLanguage = currentLanguage === "en" ? "ur" : "en";

  localStorage.setItem("chemphybio-language", currentLanguage);

  applyLanguage();
});

/* =========================================================
   MOBILE NAVIGATION
========================================================= */

$("menuToggle")?.addEventListener("click", () => {
  $("navLinks")?.classList.toggle("open");
});

document.querySelectorAll("#navLinks a").forEach(link => {
  link.addEventListener("click", () => {
    $("navLinks")?.classList.remove("open");
    $("navLinks")?.classList.remove("active");
  });
});

/* =========================================================
   FOOTER
========================================================= */

if ($("currentYear")) {
  $("currentYear").textContent = new Date().getFullYear();
}

/* =========================================================
   INITIALIZE APPLICATION
========================================================= */

async function initializeApplication() {
  setupLanguage();

  await loadQuestions();
  await loadSiteContent();

  if (currentUser) {
    await loadStudentDashboard(currentUser);

    if (isAdmin()) {
      showAdminLoggedIn(currentUser);
      await loadAdminData();
    }
  }
}

initializeApplication();
