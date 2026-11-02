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
  doc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

/* ADMIN UID
   Apni purani file wala ADMIN UID yahan paste karein.
*/
const ADMIN_UID = "JIiL8pKKWQbzNJuUR9mvrp0tGhr1;

/* SAMPLE QUIZ QUESTIONS */

const sampleQuizData = {
  Biology: [
    {
      q: "Which organelle is known as the powerhouse of the cell?",
      o: ["Nucleus", "Mitochondrion", "Ribosome", "Golgi apparatus"],
      a: 1,
      e: "Mitochondria produce most of the usable energy (ATP)."
    },
    {
      q: "What is the basic structural and functional unit of life?",
      o: ["Tissue", "Organ", "Cell", "Organ system"],
      a: 2,
      e: "The cell is the basic structural and functional unit of life."
    },
    {
      q: "Which molecule carries hereditary information?",
      o: ["DNA", "Glucose", "ATP", "Cellulose"],
      a: 0,
      e: "DNA stores hereditary information."
    }
  ],

  Chemistry: [
    {
      q: "What is the chemical symbol for sodium?",
      o: ["So", "S", "Na", "N"],
      a: 2,
      e: "Na is the chemical symbol for sodium."
    },
    {
      q: "A solution with pH 3 is:",
      o: ["Acidic", "Neutral", "Basic", "Pure water"],
      a: 0,
      e: "A pH below 7 is acidic."
    },
    {
      q: "Which particle has a negative charge?",
      o: ["Proton", "Neutron", "Electron", "Nucleus"],
      a: 2,
      e: "Electrons carry a negative charge."
    }
  ],

  Physics: [
    {
      q: "What is the SI unit of force?",
      o: ["Joule", "Newton", "Watt", "Pascal"],
      a: 1,
      e: "Force is measured in newtons."
    },
    {
      q: "Distance travelled per unit time is:",
      o: ["Acceleration", "Velocity", "Speed", "Momentum"],
      a: 2,
      e: "Speed is distance travelled per unit time."
    },
    {
      q: "Which lens is thicker at the centre?",
      o: ["Concave", "Convex", "Plane glass", "None"],
      a: 1,
      e: "A convex lens is thicker at its centre."
    }
  ],

  English: [
    {
      q: "Choose the correctly spelled word:",
      o: ["Accomodation", "Accommodation", "Acommodation", "Accommadation"],
      a: 1,
      e: "Accommodation is the correct spelling."
    },
    {
      q: "Choose the synonym of rapid:",
      o: ["Slow", "Quick", "Dull", "Weak"],
      a: 1,
      e: "Rapid means fast or quick."
    },
    {
      q: "Choose the correct sentence:",
      o: [
        "She go to school.",
        "She going to school.",
        "She goes to school.",
        "She gone to school."
      ],
      a: 2,
      e: "She goes is correct in the simple present tense."
    }
  ],

  "Logical Reasoning": [
    {
      q: "What number comes next: 2, 4, 8, 16, …?",
      o: ["18", "24", "30", "32"],
      a: 3,
      e: "Each number is doubled."
    },
    {
      q: "If all roses are flowers, which statement is true?",
      o: [
        "All flowers are roses",
        "Every rose is a flower",
        "No rose is a flower",
        "All plants are roses"
      ],
      a: 1,
      e: "Every rose is a flower."
    },
    {
      q: "Find the odd one out:",
      o: ["Triangle", "Square", "Circle", "Blue"],
      a: 3,
      e: "Blue is a colour; the others are shapes."
    }
  ]
};

/* WEBSITE DATA */

let quizData = structuredClone(sampleQuizData);

const updates = [
  {
    day: "INFO",
    month: "NOTE",
    title: "Check official MDCAT announcements",
    text: "For current dates and policies, check the relevant official authority website."
  },
  {
    day: "STUDY",
    month: "TIP",
    title: "Build a consistent revision routine",
    text: "Practise MCQs daily and review their explanations."
  },
  {
    day: "VERIFY",
    month: "ALERT",
    title: "Beware of unverified notices",
    text: "Confirm important information from official sources."
  }
];

/* GLOBAL VARIABLES */

let currentSubject = "Biology";
let questionIndex = 0;
let score = 0;
let answered = false;
let language = "en";
let editingQuestionId = null;

let fullTestQuestionBank = {};
let isFullTest = false;
let fullTestQuestions = [];
let fullTestIndex = 0;
let fullTestScore = 0;
let fullTestAnswers = {};
let fullTestReview = new Set();
let fullTestTimeLeft = 0;
let fullTestTimer = null;
let fullTestSubmitted = false;

const $ = id => document.getElementById(id);
const subjectSelect = $("subjectSelect");

/* FULL TEST DISTRIBUTION
   These are the project's configured distributions,
   not a confirmation of the official MDCAT pattern.
*/

const testDistributions = {
  100: {
    Biology: 45,
    Chemistry: 25,
    Physics: 20,
    English: 5,
    "Logical Reasoning": 5
  },

  180: {
    Biology: 81,
    Chemistry: 45,
    Physics: 36,
    English: 9,
    "Logical Reasoning": 9
  }
};

/* QUICK QUIZ */

function renderQuestion() {
  if (isFullTest) return;

  const list = quizData[currentSubject] || [];

  $("quizTitle").textContent = currentSubject + " Quick Quiz";
  $("options").innerHTML = "";
  $("feedback").textContent = "";
  $("scoreText").textContent = `Score: ${score}`;

  if (!list.length) {
    $("questionCount").textContent = "No questions available";
    $("progressPercent").textContent = "0%";
    $("progressBar").style.width = "0%";
    $("questionText").textContent =
      "No questions have been added for this subject yet.";

    $("nextQuestion").disabled = true;
    $("quizArea").classList.remove("hidden");
    $("quizResult").classList.add("hidden");
    return;
  }

  if (questionIndex >= list.length) {
    questionIndex = 0;
  }

  const item = list[questionIndex];
  answered = false;

  $("questionCount").textContent =
    `Question ${questionIndex + 1} of ${list.length}`;

  $("progressPercent").textContent =
    `${Math.round((questionIndex + 1) / list.length * 100)}%`;

  $("progressBar").style.width =
    `${(questionIndex + 1) / list.length * 100}%`;

  $("questionText").textContent = item.q;
  $("nextQuestion").disabled = true;

  $("nextQuestion").textContent =
    questionIndex === list.length - 1
      ? "See result →"
      : "Next question →";

  item.o.forEach((option, index) => {
    const button = document.createElement("button");

    button.className = "option";
    button.type = "button";
    button.textContent =
      `${String.fromCharCode(65 + index)}. ${option}`;

    button.addEventListener("click", () => selectAnswer(index));

    $("options").appendChild(button);
  });

  $("quizArea").classList.remove("hidden");
  $("quizResult").classList.add("hidden");
}

function selectAnswer(index) {
  if (answered || isFullTest) return;

  const item = quizData[currentSubject][questionIndex];
  answered = true;

  [...$("options").children].forEach((button, i) => {
    button.disabled = true;

    if (i === item.a) {
      button.classList.add("correct");
    } else if (i === index) {
      button.classList.add("wrong");
    }
  });

  if (index === item.a) {
    score++;
    $("feedback").textContent = "✓ Correct! " + item.e;
  } else {
    $("feedback").textContent = "Not quite. " + item.e;
  }

  $("scoreText").textContent = `Score: ${score}`;
  $("nextQuestion").disabled = false;
}

function nextQuestion() {
  if (isFullTest) {
    nextFullTestQuestion();
    return;
  }

  if (!answered) return;

  if (questionIndex < quizData[currentSubject].length - 1) {
    questionIndex++;
    renderQuestion();
  } else {
    $("quizArea").classList.add("hidden");
    $("quizResult").classList.remove("hidden");

    const total = quizData[currentSubject].length;
    const percent = Math.round(score / total * 100);

    $("quizResult").innerHTML = `
      <div style="font-size:38px">🎓</div>
      <h3>Quiz completed!</h3>
      <strong>${score}/${total}</strong>
      <p>You scored ${percent}%. Keep practising!</p>
      <button class="btn btn-primary" id="retryQuiz">
        Try again
      </button>
    `;

    $("retryQuiz").addEventListener("click", resetQuiz);
  }
}

function resetQuiz() {
  if (isFullTest) {
    clearInterval(fullTestTimer);
    isFullTest = false;
  }

  questionIndex = 0;
  score = 0;
  answered = false;

  $("quizTitle").textContent = currentSubject + " Quick Quiz";
  renderQuestion();
}

function changeSubject(subject) {
  if (isFullTest) return;

  currentSubject = subject;
  subjectSelect.value = subject;

  resetQuiz();

  $("quiz").scrollIntoView({ behavior: "smooth" });
}

subjectSelect.addEventListener("change", event => {
  changeSubject(event.target.value);
});

$("nextQuestion").addEventListener("click", nextQuestion);

document.querySelectorAll(".subject-quiz").forEach(button => {
  button.addEventListener("click", () => {
    changeSubject(button.dataset.subject);
  });
});

/* LOAD QUESTIONS FROM FIRESTORE */

async function loadQuestions() {
  try {
    const snapshot = await getDocs(collection(db, "questions"));
    const onlineQuestions = {};

    snapshot.forEach(documentSnapshot => {
      const item = documentSnapshot.data();

      const validQuestion =
        typeof item.question === "string" &&
        Array.isArray(item.options) &&
        item.options.length === 4 &&
        Number.isInteger(item.answer) &&
        item.answer >= 0 &&
        item.answer <= 3 &&
        typeof item.subject === "string";

      if (!validQuestion) return;

      if (!onlineQuestions[item.subject]) {
        onlineQuestions[item.subject] = [];
      }

      onlineQuestions[item.subject].push({
        id: documentSnapshot.id,
        q: item.question,
        o: item.options,
        a: item.answer,
        e: item.explanation || ""
      });
    });

    // Full Test uses Firestore questions only.
    fullTestQuestionBank = structuredClone(onlineQuestions);

    // Quick Quiz can use sample questions.
    quizData = structuredClone(sampleQuizData);

    Object.keys(onlineQuestions).forEach(subject => {
      if (onlineQuestions[subject].length) {
        quizData[subject] = onlineQuestions[subject];
      }
    });

    if (!isFullTest) {
      renderQuestion();
    }

  } catch (error) {
    console.error("Question loading error:", error);

    $("feedback").textContent =
      "Online questions could not be loaded. Showing sample questions.";
  }
}

/* FULL TEST SYSTEM */

function shuffleQuestions(array) {
  const shuffled = [...array];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [shuffled[i], shuffled[j]] =
      [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

function createFullTestQuestions(total) {
  const distribution = testDistributions[total];

  if (!distribution) {
    return { error: "Invalid test size." };
  }

  const testQuestions = [];

  for (const subject in distribution) {
    const required = distribution[subject];
    const available = fullTestQuestionBank[subject] || [];

    if (available.length < required) {
      return {
        error: `${subject}: ${required} required, ${available.length} available.`
      };
    }

    const selected =
      shuffleQuestions(available).slice(0, required);

    selected.forEach(question => {
      testQuestions.push({
        ...question,
        subject
      });
    });
  }

  return {
    questions: shuffleQuestions(testQuestions)
  };
}

/* CREATE TEST CONTROLS */

function prepareFullTestControls() {
  if (!$("fullTestTimerDisplay")) {
    const timer = document.createElement("p");

    timer.id = "fullTestTimerDisplay";
    timer.style.fontWeight = "bold";
    timer.style.textAlign = "center";
    timer.style.fontSize = "18px";

    $("quizArea").prepend(timer);
  }

  if (!$("fullTestNavigation")) {
    const controls = document.createElement("div");

    controls.id = "fullTestNavigation";

    controls.style.cssText =
      "display:flex;gap:10px;flex-wrap:wrap;margin:15px 0;";

    controls.innerHTML = `
      <button type="button" class="btn btn-outline" id="previousFullTest">
        Previous
      </button>

      <button type="button" class="btn btn-outline" id="markFullTest">
        Mark for Review
      </button>

      <button type="button" class="btn btn-outline" id="nextFullTest">
        Next
      </button>
    `;

    $("quizArea").appendChild(controls);

    $("previousFullTest").addEventListener("click", () => {
      if (fullTestIndex > 0 && isFullTest) {
        fullTestIndex--;
        renderFullTestQuestion();
      }
    });

    $("markFullTest").addEventListener("click", () => {
      if (!isFullTest) return;

      if (fullTestReview.has(fullTestIndex)) {
        fullTestReview.delete(fullTestIndex);
      } else {
        fullTestReview.add(fullTestIndex);
      }

      renderFullTestQuestion();
    });

    $("nextFullTest").addEventListener("click", nextFullTestQuestion);
  }
}

/* START FULL TEST */

function startFullTest() {
  if (isFullTest) return;

  const total = Number($("testModeSelect").value);
  const result = createFullTestQuestions(total);

  if (!result || result.error) {
    $("fullTestMessage").textContent =
      "Not enough MCQs. " +
      (result?.error || "Please check the test size.");

    return;
  }

  fullTestQuestions = result.questions;
  fullTestIndex = 0;
  fullTestScore = 0;
  fullTestAnswers = {};
  fullTestReview = new Set();
  fullTestTimeLeft = total * 60;
  fullTestSubmitted = false;
  isFullTest = true;

  $("fullTestMessage").textContent = "";
  $("fullTestSetup").classList.add("hidden");
  $("quizResult").classList.add("hidden");
  $("quizArea").classList.remove("hidden");

  prepareFullTestControls();
  renderFullTestQuestion();
  startFullTestTimer();
}

/* FULL TEST TIMER */

function startFullTestTimer() {
  clearInterval(fullTestTimer);

  fullTestTimer = setInterval(() => {
    if (!isFullTest || fullTestSubmitted) {
      clearInterval(fullTestTimer);
      return;
    }

    fullTestTimeLeft--;

    const minutes = Math.floor(fullTestTimeLeft / 60);
    const seconds = fullTestTimeLeft % 60;

    $("fullTestTimerDisplay").textContent =
      `Time Left: ${minutes}:${String(seconds).padStart(2, "0")}`;

    if (fullTestTimeLeft <= 0) {
      submitFullTest();
    }
  }, 1000);
}

/* DISPLAY FULL TEST QUESTION */

function renderFullTestQuestion() {
  const item = fullTestQuestions[fullTestIndex];

  if (!item || !isFullTest) return;

  $("quizTitle").textContent = "Full-Length MDCAT Test";

  $("questionCount").textContent =
    `Question ${fullTestIndex + 1} of ${fullTestQuestions.length}`;

  $("questionText").textContent = item.q;
  $("options").innerHTML = "";
  $("feedback").textContent = "";

  $("progressPercent").textContent =
    `${Math.round((fullTestIndex + 1) / fullTestQuestions.length * 100)}%`;

  $("progressBar").style.width =
    `${(fullTestIndex + 1) / fullTestQuestions.length * 100}%`;

  item.o.forEach((option, index) => {
    const button = document.createElement("button");

    button.className = "option";
    button.type = "button";

    button.textContent =
      `${String.fromCharCode(65 + index)}. ${option}`;

    if (fullTestAnswers[fullTestIndex] === index) {
      button.classList.add("selected");
    }

    button.addEventListener("click", () => {
      if (!isFullTest) return;

      fullTestAnswers[fullTestIndex] = index;
      renderFullTestQuestion();
    });

    $("options").appendChild(button);
  });

  $("scoreText").textContent =
    `Answered: ${Object.keys(fullTestAnswers).length}`;

  $("previousFullTest").disabled = fullTestIndex === 0;

  $("markFullTest").textContent =
    fullTestReview.has(fullTestIndex)
      ? "Remove Review Mark"
      : "Mark for Review";

  $("nextFullTest").textContent =
    fullTestIndex === fullTestQuestions.length - 1
      ? "Submit Test"
      : "Next";

  const minutes = Math.floor(fullTestTimeLeft / 60);
  const seconds = fullTestTimeLeft % 60;

  $("fullTestTimerDisplay").textContent =
    `Time Left: ${minutes}:${String(seconds).padStart(2, "0")}`;
}

/* NEXT FULL TEST QUESTION */

function nextFullTestQuestion() {
  if (!isFullTest || fullTestSubmitted) return;

  if (fullTestIndex < fullTestQuestions.length - 1) {
    fullTestIndex++;
    renderFullTestQuestion();
  } else {
    submitFullTest();
  }
}

/* SUBMIT FULL TEST AND SHOW RESULTS */

function submitFullTest() {
  if (fullTestSubmitted || !isFullTest) return;

  fullTestSubmitted = true;
  clearInterval(fullTestTimer);

  fullTestScore = fullTestQuestions.reduce((total, question, index) => {
    return total +
      (fullTestAnswers[index] === question.a ? 1 : 0);
  }, 0);

  const total = fullTestQuestions.length;
  const percentage = Math.round((fullTestScore / total) * 100);

  const unanswered =
    total - Object.keys(fullTestAnswers).length;

  const subjectResults = {};

  fullTestQuestions.forEach((question, index) => {
    const subject = question.subject;

    if (!subjectResults[subject]) {
      subjectResults[subject] = {
        correct: 0,
        total: 0
      };
    }

    subjectResults[subject].total++;

    if (fullTestAnswers[index] === question.a) {
      subjectResults[subject].correct++;
    }
  });

  const subjectHTML = Object.entries(subjectResults)
    .map(([subject, result]) => {
      const subjectPercentage =
        Math.round(result.correct / result.total * 100);

      return `
        <p>
          <strong>${subject}:</strong>
          ${result.correct}/${result.total}
          (${subjectPercentage}%)
        </p>
      `;
    })
    .join("");

  isFullTest = false;

  $("quizArea").classList.add("hidden");
  $("quizResult").classList.remove("hidden");

  $("quizResult").innerHTML = `
    <h3>Full Test Completed!</h3>

    <div style="font-size:36px">🎓</div>

    <h2>${fullTestScore} / ${total}</h2>

    <p>Percentage: ${percentage}%</p>
    <p>Unanswered: ${unanswered}</p>
    <p>Marked for Review: ${fullTestReview.size}</p>

    <hr>

    <h3>Subject-wise Result</h3>

    ${subjectHTML}

    <button class="btn btn-primary" id="fullTestAgain">
      Back to Quiz
    </button>
  `;

  $("fullTestAgain").addEventListener("click", () => {
    $("quizResult").classList.add("hidden");
    $("fullTestSetup").classList.remove("hidden");

    $("fullTestMessage").textContent = "";
    $("fullTestTimerDisplay").textContent = "";

    resetQuiz();
  });
}

$("startFullTest").addEventListener("click", startFullTest);

/* UPDATES */

function renderUpdates() {
  $("updatesList").innerHTML = "";

  updates.forEach(item => {
    const card = document.createElement("article");
    card.className = "update-card";

    const date = document.createElement("div");
    date.className = "update-date";

    const strong = document.createElement("strong");
    strong.textContent = item.day;

    const small = document.createElement("span");
    small.textContent = item.month;

    date.append(strong, small);

    const body = document.createElement("div");

    const title = document.createElement("h3");
    title.textContent = item.title;

    const paragraph = document.createElement("p");
    paragraph.textContent = item.text;

    body.append(title, paragraph);
    card.append(date, body);

    $("updatesList").append(card);
  });
}

/* LANGUAGE */

function setLanguage(next) {
  language = next;

  document.body.classList.toggle("urdu", language === "ur");

  document.documentElement.lang =
    language === "ur" ? "ur" : "en";

  document.querySelectorAll("[data-en]").forEach(element => {
    element.innerHTML =
      language === "ur"
        ? element.dataset.ur
        : element.dataset.en;
  });

  $("languageToggle").textContent =
    language === "ur" ? "English" : "اردو";
}

$("languageToggle").addEventListener("click", () => {
  setLanguage(language === "en" ? "ur" : "en");
});

$("menuToggle").addEventListener("click", () => {
  $("mainNav").classList.toggle("open");
});

document.querySelectorAll("#mainNav a").forEach(link => {
  link.addEventListener("click", () => {
    $("mainNav").classList.remove("open");
  });
});

$("year").textContent = new Date().getFullYear();

/* ADMIN LOGIN */

$("adminLoginForm").addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("adminEmail").value.trim();
  const password = $("adminPassword").value;

  $("adminMessage").textContent = "Logging in...";

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error("Admin login error:", error);

    $("adminMessage").textContent =
      "Login failed. Please check your details.";
  }
});

/* CHECK ADMIN ACCOUNT */

onAuthStateChanged(auth, async user => {
  if (user && user.uid === ADMIN_UID) {
    $("adminLogin").classList.add("hidden");
    $("adminDashboard").classList.remove("hidden");

    await renderAdminQuestions();
  } else {
    $("adminLogin").classList.remove("hidden");
    $("adminDashboard").classList.add("hidden");

    if (user) {
      await signOut(auth);

      $("adminMessage").textContent =
        "This account is not an authorized admin.";
    }
  }
});

$("adminLogout").addEventListener("click", () => {
  signOut(auth);
});

/* DISPLAY ADMIN QUESTIONS */

async function renderAdminQuestions() {
  const list = $("adminMcqList");

  list.innerHTML = "Loading questions...";

  try {
    const snapshot = await getDocs(collection(db, "questions"));

    list.innerHTML = "";

    if (snapshot.empty) {
      list.textContent = "No online questions added yet.";
      return;
    }

    snapshot.forEach(documentSnapshot => {
      const item = documentSnapshot.data();

      const card = document.createElement("article");
      card.className = "admin-mcq-card";

      const title = document.createElement("strong");

      title.textContent =
        item.subject + ": " + item.question;

      const details = document.createElement("p");

      details.textContent =
        (item.options || []).join(" | ");

      const edit = document.createElement("button");

      edit.className = "btn btn-outline";
      edit.type = "button";
      edit.textContent = "Edit";

      edit.addEventListener("click", () => {
        editQuestion(documentSnapshot.id, item);
      });

      const remove = document.createElement("button");

      remove.className = "btn btn-outline";
      remove.type = "button";
      remove.textContent = "Delete";

      remove.addEventListener("click", () => {
        removeQuestion(documentSnapshot.id);
      });

      card.append(title, details, edit, remove);
      list.appendChild(card);
    });

  } catch (error) {
    console.error("Admin questions error:", error);

    list.textContent =
      "Could not load questions. Check Firestore security rules.";
  }
}

/* ADD OR UPDATE QUESTION */

$("mcqForm").addEventListener("submit", async event => {
  event.preventDefault();

  const data = {
    subject: $("mcqSubject").value,
    question: $("mcqQuestion").value.trim(),

    options: [
      $("mcqOption0").value.trim(),
      $("mcqOption1").value.trim(),
      $("mcqOption2").value.trim(),
      $("mcqOption3").value.trim()
    ],

    answer: Number($("mcqAnswer").value),
    explanation: $("mcqExplanation").value.trim()
  };

  if (
    !data.question ||
    data.options.some(option => !option) ||
    !Number.isInteger(data.answer) ||
    data.answer < 0 ||
    data.answer > 3
  ) {
    $("adminStatus").textContent =
      "Please complete all question fields correctly.";

    return;
  }

  $("adminStatus").textContent = "Saving...";

  try {
    if (editingQuestionId) {
      await updateDoc(
        doc(db, "questions", editingQuestionId),
        data
      );

      $("adminStatus").textContent =
        "Question updated successfully.";

    } else {
      await addDoc(collection(db, "questions"), data);

      $("adminStatus").textContent =
        "Question added successfully.";
    }

    $("mcqForm").reset();

    editingQuestionId = null;
    $("mcqId").value = "";
    $("saveMcq").textContent = "Save MCQ";

    await renderAdminQuestions();
    await loadQuestions();

  } catch (error) {
    console.error("MCQ save error:", error);

    $("adminStatus").textContent =
      "Save failed. Check Firestore security rules.";
  }
});

/* EDIT QUESTION */

function editQuestion(id, item) {
  editingQuestionId = id;

  $("mcqId").value = id;
  $("mcqSubject").value = item.subject;
  $("mcqQuestion").value = item.question;

  $("mcqOption0").value = item.options[0] || "";
  $("mcqOption1").value = item.options[1] || "";
  $("mcqOption2").value = item.options[2] || "";
  $("mcqOption3").value = item.options[3] || "";

  $("mcqAnswer").value = String(item.answer);
  $("mcqExplanation").value = item.explanation || "";

  $("saveMcq").textContent = "Update MCQ";

  $("mcqForm").scrollIntoView({
    behavior: "smooth"
  });
}

/* DELETE QUESTION */

async function removeQuestion(id) {
  if (!confirm("Are you sure you want to delete this question?")) {
    return;
  }

  try {
    await deleteDoc(doc(db, "questions", id));

    $("adminStatus").textContent = "Question deleted.";

    await renderAdminQuestions();
    await loadQuestions();

  } catch (error) {
    console.error("Question delete error:", error);

    $("adminStatus").textContent =
      "Delete failed. Check Firestore security rules.";
  }
}

/* CANCEL EDIT */

$("cancelEdit").addEventListener("click", () => {
  editingQuestionId = null;

  $("mcqForm").reset();
  $("mcqId").value = "";

  $("saveMcq").textContent = "Save MCQ";
  $("adminStatus").textContent = "";
});

/* INITIALIZE WEBSITE */

renderUpdates();
renderQuestion();
loadQuestions();
