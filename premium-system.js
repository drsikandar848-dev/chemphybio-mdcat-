/* =====================================================
   CHEMPHYBIO MDCAT — PREMIUM SYSTEM
   Membership Plans + Premium Questions + Payments
===================================================== */

import { auth, db } from "./firebase-config.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";


/* ---------------- CONFIGURATION ---------------- */

const ADMIN_UID = "JIiL8pKKWQbzNJuUR9mvrp0tGhr1";

const PREMIUM_QUESTIONS = "premiumQuestions";
const FREE_QUESTIONS = "questions";
const PACKAGES = "membershipPackages";
const MEMBERS = "premiumMembers";
const PAYMENTS = "paymentRequests";
const PAYMENT_SETTINGS = "paymentSettings";


/* ---------------- HELPERS ---------------- */

function currentEmail() {
  return auth.currentUser?.email?.trim().toLowerCase() || "";
}

function requireLogin() {
  if (!auth.currentUser) {
    throw new Error("Please login with Google first.");
  }
}

function requireEmail() {
  requireLogin();

  const email = currentEmail();

  if (!email) {
    throw new Error("Google account email is unavailable.");
  }

  return email;
}

function requireAdmin() {
  requireLogin();

  if (auth.currentUser.uid !== ADMIN_UID) {
    throw new Error("Admin permission required.");
  }
}

function cleanFeatures(features) {
  if (Array.isArray(features)) {
    return features
      .map(item => String(item).trim())
      .filter(Boolean);
  }

  if (typeof features === "string") {
    return features
      .split("\n")
      .map(item => item.trim())
      .filter(Boolean);
  }

  return [];
}

function validatePackage(data) {
  const name = String(data.name || "").trim();
  const price = Number(data.price);
  const durationDays = Number(data.durationDays);

  if (!name) {
    throw new Error("Enter a plan name.");
  }

  if (!Number.isFinite(price) || price < 0) {
    throw new Error("Enter a valid plan price.");
  }

  if (!Number.isInteger(durationDays) || durationDays < 1) {
    throw new Error("Enter a valid duration in days.");
  }

  return {
    name,
    price,
    durationDays,
    description: String(data.description || "").trim(),
    features: cleanFeatures(data.features)
  };
}


/* =====================================================
   1. SAVE MCQ — FREE OR PREMIUM
===================================================== */

export async function savePremiumSystemQuestion(
  questionData,
  accessType = "free",
  questionId = null
) {
  requireAdmin();

  const question = {
    subject: String(questionData.subject || "").trim(),
    chapter: String(questionData.chapter || "").trim(),
    question: String(questionData.question || "").trim(),
    options: questionData.options,
    answer: Number(questionData.answer),
    explanation: String(questionData.explanation || "").trim(),
    updatedAt: serverTimestamp()
  };

  if (
    !question.subject ||
    !question.chapter ||
    !question.question ||
    !Array.isArray(question.options) ||
    question.options.length !== 4 ||
    question.options.some(option => !String(option).trim()) ||
    !Number.isInteger(question.answer) ||
    question.answer < 0 ||
    question.answer > 3
  ) {
    throw new Error("Please complete all MCQ fields correctly.");
  }

  const targetCollection =
    accessType === "premium"
      ? PREMIUM_QUESTIONS
      : FREE_QUESTIONS;

  if (questionId) {
    const premiumRef = doc(db, PREMIUM_QUESTIONS, questionId);
    const freeRef = doc(db, FREE_QUESTIONS, questionId);

    const [premiumSnapshot, freeSnapshot] = await Promise.all([
      getDoc(premiumRef),
      getDoc(freeRef)
    ]);

    const oldSnapshot =
      premiumSnapshot.exists() ? premiumSnapshot : freeSnapshot;

    if (!oldSnapshot.exists()) {
      throw new Error("Question not found.");
    }

    const oldCollection = premiumSnapshot.exists()
      ? PREMIUM_QUESTIONS
      : FREE_QUESTIONS;

    const oldData = oldSnapshot.data();

    const updatedQuestion = {
      ...oldData,
      ...question
    };

    if (oldCollection === targetCollection) {
      await updateDoc(
        doc(db, targetCollection, questionId),
        question
      );
    } else {
      await setDoc(
        doc(db, targetCollection, questionId),
        updatedQuestion
      );

      await deleteDoc(
        doc(db, oldCollection, questionId)
      );
    }

    return questionId;
  }

  question.createdAt = serverTimestamp();

  const result = await addDoc(
    collection(db, targetCollection),
    question
  );

  return result.id;
}


/* =====================================================
   2. LOAD PREMIUM QUESTIONS — ADMIN
===================================================== */

export async function loadPremiumSystemQuestions() {
  requireAdmin();

  const snapshot = await getDocs(
    collection(db, PREMIUM_QUESTIONS)
  );

  return snapshot.docs.map(item => ({
    id: item.id,
    ...item.data()
  }));
}


/* =====================================================
   3. LOAD PREMIUM QUESTIONS — STUDENT
===================================================== */

export async function loadStudentPremiumQuestions() {
  requireLogin();

  const membership = await checkPremiumMembership();

  if (!membership.active) {
    return {
      active: false,
      questions: [],
      reason: membership.reason
    };
  }

  const snapshot = await getDocs(
    collection(db, PREMIUM_QUESTIONS)
  );

  return {
    active: true,
    questions: snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    })),
    reason: "Membership active."
  };
}


/* =====================================================
   4. DELETE PREMIUM QUESTION
===================================================== */

export async function deletePremiumSystemQuestion(questionId) {
  requireAdmin();

  if (!questionId) {
    throw new Error("Question ID is required.");
  }

  await deleteDoc(
    doc(db, PREMIUM_QUESTIONS, questionId)
  );
}


/* =====================================================
   5. CREATE MEMBERSHIP PACKAGE
===================================================== */

export async function createMembershipPackage({
  name,
  price,
  durationDays,
  description = "",
  features = []
}) {
  requireAdmin();

  const packageData = validatePackage({
    name,
    price,
    durationDays,
    description,
    features
  });

  packageData.active = true;
  packageData.createdAt = serverTimestamp();
  packageData.updatedAt = serverTimestamp();

  const result = await addDoc(
    collection(db, PACKAGES),
    packageData
  );

  return result.id;
}


/* =====================================================
   6. LOAD ACTIVE PACKAGES — STUDENTS
===================================================== */

export async function loadMembershipPackages() {
  const snapshot = await getDocs(
    query(
      collection(db, PACKAGES),
      where("active", "==", true)
    )
  );

  return snapshot.docs.map(item => ({
    id: item.id,
    ...item.data()
  }));
}


/* =====================================================
   7. LOAD ALL PACKAGES — ADMIN
===================================================== */

export async function loadAllMembershipPackages() {
  requireAdmin();

  const snapshot = await getDocs(
    collection(db, PACKAGES)
  );

  return snapshot.docs.map(item => ({
    id: item.id,
    ...item.data()
  }));
}


/* =====================================================
   8. UPDATE MEMBERSHIP PACKAGE
===================================================== */

export async function updateMembershipPackage(
  packageId,
  updates
) {
  requireAdmin();

  if (!packageId) {
    throw new Error("Package ID is required.");
  }

  const packageRef = doc(db, PACKAGES, packageId);
  const snapshot = await getDoc(packageRef);

  if (!snapshot.exists()) {
    throw new Error("Membership package not found.");
  }

  const oldData = snapshot.data();

  const updatedData = validatePackage({
    ...oldData,
    ...updates
  });

  updatedData.updatedAt = serverTimestamp();

  await updateDoc(packageRef, updatedData);

  return packageId;
}


/* =====================================================
   9. ACTIVATE / DEACTIVATE PACKAGE
===================================================== */

export async function setMembershipPackageActive(
  packageId,
  active
) {
  requireAdmin();

  if (!packageId) {
    throw new Error("Package ID is required.");
  }

  await updateDoc(
    doc(db, PACKAGES, packageId),
    {
      active: Boolean(active),
      updatedAt: serverTimestamp()
    }
  );
}


/* =====================================================
   10. DELETE MEMBERSHIP PACKAGE
===================================================== */

export async function deleteMembershipPackage(packageId) {
  requireAdmin();

  if (!packageId) {
    throw new Error("Package ID is required.");
  }

  const packageRef = doc(db, PACKAGES, packageId);
  const snapshot = await getDoc(packageRef);

  if (!snapshot.exists()) {
    throw new Error("Membership package not found.");
  }

  await deleteDoc(packageRef);
}


/* =====================================================
   11. LOAD PAYMENT REQUESTS — ADMIN
===================================================== */

export async function loadPaymentRequests() {
  requireAdmin();

  const snapshot = await getDocs(
    query(
      collection(db, PAYMENTS),
      orderBy("createdAt", "desc")
    )
  );

  return snapshot.docs.map(item => ({
    id: item.id,
    ...item.data()
  }));
}


/* =====================================================
   12. STUDENT — SUBMIT PAYMENT REQUEST
===================================================== */

export async function submitPremiumPayment({
  packageId,
  paymentMethod,
  transactionId
}) {
  const email = requireEmail();

  const method = String(paymentMethod || "").trim();
  const transaction = String(transactionId || "").trim();

  if (!packageId || !transaction) {
    throw new Error("Enter all payment details.");
  }

  if (!["Easypaisa", "JazzCash"].includes(method)) {
    throw new Error("Invalid payment method.");
  }

  const packageSnapshot = await getDoc(
    doc(db, PACKAGES, packageId)
  );

  if (
    !packageSnapshot.exists() ||
    packageSnapshot.data().active !== true
  ) {
    throw new Error("This package is unavailable.");
  }

  const selectedPackage = packageSnapshot.data();

  const paymentData = {
    email,
    packageId,
    packageName: String(selectedPackage.name || "Premium Plan"),
    amount: Number(selectedPackage.price),
    durationDays: Number(selectedPackage.durationDays),
    paymentMethod: method,
    transactionId: transaction,
    status: "pending",
    createdAt: serverTimestamp()
  };

  const result = await addDoc(
    collection(db, PAYMENTS),
    paymentData
  );

  return result.id;
}


/* =====================================================
   13. ADMIN — APPROVE PAYMENT
===================================================== */

export async function approvePremiumPayment(requestId) {
  requireAdmin();

  const requestRef = doc(db, PAYMENTS, requestId);
  const requestSnapshot = await getDoc(requestRef);

  if (!requestSnapshot.exists()) {
    throw new Error("Payment request not found.");
  }

  const payment = requestSnapshot.data();

  if (payment.status !== "pending") {
    throw new Error("This request has already been processed.");
  }

  const email = String(payment.email || "")
    .trim()
    .toLowerCase();

  if (!email || !payment.packageId) {
    throw new Error("Invalid payment request.");
  }

  const packageSnapshot = await getDoc(
    doc(db, PACKAGES, payment.packageId)
  );

  const selectedPackage = packageSnapshot.exists()
    ? packageSnapshot.data()
    : {};

  const packageName = String(
    payment.packageName ||
    selectedPackage.name ||
    "Premium Plan"
  );

  const durationDays = Number(
    payment.durationDays || selectedPackage.durationDays
  );

  if (!Number.isInteger(durationDays) || durationDays < 1) {
    throw new Error("Invalid membership duration.");
  }

  const memberRef = doc(db, MEMBERS, email);
  const memberSnapshot = await getDoc(memberRef);

  const now = new Date();
  let startDate = now;

  if (memberSnapshot.exists()) {
    const oldExpiry = memberSnapshot.data().expiresAt?.toDate?.();

    if (oldExpiry && oldExpiry > now) {
      startDate = oldExpiry;
    }
  }

  const expiryDate = new Date(
    startDate.getTime() +
    durationDays * 24 * 60 * 60 * 1000
  );

  const batch = writeBatch(db);

  batch.set(memberRef, {
    email,
    active: true,
    packageId: payment.packageId,
    packageName,
    expiresAt: Timestamp.fromDate(expiryDate),
    approvedAt: serverTimestamp(),
    approvedBy: currentEmail()
  });

  batch.update(requestRef, {
    status: "approved",
    approvedAt: serverTimestamp(),
    reviewedBy: currentEmail()
  });

  await batch.commit();

  return expiryDate;
}


/* =====================================================
   14. ADMIN — REJECT PAYMENT
===================================================== */

export async function rejectPremiumPayment(requestId) {
  requireAdmin();

  const requestRef = doc(db, PAYMENTS, requestId);
  const snapshot = await getDoc(requestRef);

  if (!snapshot.exists()) {
    throw new Error("Payment request not found.");
  }

  if (snapshot.data().status !== "pending") {
    throw new Error("This request has already been processed.");
  }

  await updateDoc(requestRef, {
    status: "rejected",
    reviewedAt: serverTimestamp(),
    reviewedBy: currentEmail()
  });
}


/* =====================================================
   15. CHECK STUDENT MEMBERSHIP
===================================================== */

export async function checkPremiumMembership() {
  const email = requireEmail();

  const snapshot = await getDoc(
    doc(db, MEMBERS, email)
  );

  if (!snapshot.exists()) {
    return {
      active: false,
      reason: "No membership found."
    };
  }

  const member = snapshot.data();
  const expiry = member.expiresAt?.toDate?.();

  const active =
    member.active === true &&
    expiry instanceof Date &&
    expiry > new Date();

  return {
    active,
    email,
    packageName: member.packageName || "",
    expiresAt: expiry || null,
    reason: active
      ? "Membership active."
      : "Membership expired."
  };
}


/* =====================================================
   16. ADMIN — DEACTIVATE MEMBERSHIP
===================================================== */

export async function deactivatePremiumMember(email) {
  requireAdmin();

  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  if (!normalizedEmail) {
    throw new Error("Enter a valid Gmail address.");
  }

  const memberRef = doc(db, MEMBERS, normalizedEmail);
  const snapshot = await getDoc(memberRef);

  if (!snapshot.exists()) {
    throw new Error("Membership not found.");
  }

  await updateDoc(memberRef, {
    active: false,
    deactivatedAt: serverTimestamp()
  });
}


/* =====================================================
   17. SAVE PAYMENT ACCOUNT SETTINGS
===================================================== */

export async function savePremiumPaymentSettings({
  easypaisaTitle,
  easypaisaNumber,
  jazzcashTitle,
  jazzcashNumber,
  instructions
}) {
  requireAdmin();

  await setDoc(
    doc(db, PAYMENT_SETTINGS, "main"),
    {
      easypaisaTitle: String(easypaisaTitle || "").trim(),
      easypaisaNumber: String(easypaisaNumber || "").trim(),
      jazzcashTitle: String(jazzcashTitle || "").trim(),
      jazzcashNumber: String(jazzcashNumber || "").trim(),
      instructions: String(instructions || "").trim(),
      updatedAt: serverTimestamp()
    }
  );
}


/* =====================================================
   18. LOAD PAYMENT ACCOUNT SETTINGS
===================================================== */

export async function loadPremiumPaymentSettings() {
  const snapshot = await getDoc(
    doc(db, PAYMENT_SETTINGS, "main")
  );

  return snapshot.exists() ? snapshot.data() : null;
       }
